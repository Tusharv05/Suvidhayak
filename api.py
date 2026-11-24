
"""
Medical Chatbot API
===================
Single FastAPI app combining:
  - LangGraph inference pipeline (extract → classify → respond)
  - SQLite persistence  (sessions + full chat history)
  - SSE streaming       (tokens arrive word-by-word at the client)
  - Session management  (auto-delete after 24 h inactivity / explicit DELETE)

Run:
    uv run uvicorn api:app --reload --port 8000

Endpoints:
    POST   /chat          → SSE stream (tokens + final metadata)
    DELETE /chat/{chat_id}→ immediately delete session
    GET    /chat/{chat_id}/history → full chat history for a session
"""

import re
import json
import uuid
import queue
from dotenv import load_dotenv
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import TypedDict, Literal, List, Optional, Generator

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, START, END
try:
    import google.generativeai as genai
except ImportError:
    genai = None
try:
    from langchain_groq import ChatGroq
except ImportError:
    ChatGroq = None
try:
    from langchain_aws import ChatBedrock
    import boto3
except ImportError:
    ChatBedrock = None
    boto3 = None
import os

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

# Load .env
load_dotenv()

DB_PATH          = "medical_chat.db"
SESSION_TTL_HOURS = 24


# ─────────────────────────────────────────────
# SQLite helpers
# ─────────────────────────────────────────────
@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Thread-safe SQLite connection context manager."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # safe for concurrent reads
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables on startup if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                chat_id    TEXT PRIMARY KEY,
                age        INTEGER NOT NULL,
                gender     TEXT    NOT NULL,
                language   TEXT    NOT NULL DEFAULT 'English',
                weight     REAL,
                created_at TEXT    NOT NULL,
                expires_at TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chat_history (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id            TEXT    NOT NULL,
                user_input         TEXT    NOT NULL,
                assistant_response TEXT    NOT NULL,
                emergency_status   TEXT    NOT NULL,
                body_parts         TEXT,          -- JSON array string or NULL
                timestamp          TEXT    NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES sessions(chat_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_history_chat_id
                ON chat_history(chat_id);
        """)
        # Migrations: add columns to existing sessions tables
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN language TEXT NOT NULL DEFAULT 'English'")
        except Exception:
            pass  # column already exists
        try:
            conn.execute("ALTER TABLE sessions ADD COLUMN weight REAL")
        except Exception:
            pass  # column already exists


def _expiry_str(hours: int = SESSION_TTL_HOURS) -> str:
    return (datetime.now() + timedelta(hours=hours)).isoformat()


def db_create_session(chat_id: str, age: int, gender: str, language: str = "English", weight: Optional[float] = None) -> None:
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO sessions(chat_id, age, gender, language, weight, created_at, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (chat_id, age, gender, language, weight, datetime.now().isoformat(), _expiry_str()),
        )


def db_get_session(chat_id: str) -> Optional[dict]:
    """Return session dict if exists and not expired, else None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE chat_id = ?", (chat_id,)
        ).fetchone()
    if not row:
        return None
    if datetime.fromisoformat(row["expires_at"]) < datetime.now():
        db_delete_session(chat_id)   # lazy expiry
        return None
    return dict(row)


def db_touch_session(chat_id: str) -> None:
    """Reset 24 h expiry timer after activity."""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET expires_at = ? WHERE chat_id = ?",
            (_expiry_str(), chat_id),
        )


def db_delete_session(chat_id: str) -> None:
    """Delete session + all its history (CASCADE)."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE chat_id = ?", (chat_id,))


def db_update_language(chat_id: str, language: str) -> None:
    """Persist the detected language for a session."""
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET language = ? WHERE chat_id = ?",
            (language, chat_id),
        )


def db_save_turn(
    chat_id: str,
    user_input: str,
    assistant_response: str,
    emergency_status: str,
    body_parts: Optional[List[str]],
) -> None:
    bp_str = json.dumps(body_parts) if body_parts else None
    with get_db() as conn:
        conn.execute(
            "INSERT INTO chat_history"
            "(chat_id, user_input, assistant_response, emergency_status, body_parts, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (chat_id, user_input, assistant_response,
             emergency_status, bp_str, datetime.now().isoformat()),
        )
    db_touch_session(chat_id)


def db_get_history(chat_id: str, limit: int = 6) -> List[dict]:
    """Retrieve last `limit` turns for context window."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT user_input, assistant_response, body_parts, timestamp "
            "FROM chat_history WHERE chat_id = ? "
            "ORDER BY id DESC LIMIT ?",
            (chat_id, limit),
        ).fetchall()
    # return in chronological order
    return [dict(r) for r in reversed(rows)]


def db_get_full_history(chat_id: str) -> List[dict]:
    """Retrieve all turns for a session (used by GET /chat/{chat_id}/history)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, user_input, assistant_response, emergency_status, "
            "body_parts, timestamp "
            "FROM chat_history WHERE chat_id = ? ORDER BY id",
            (chat_id,),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["body_parts"] = json.loads(d["body_parts"]) if d["body_parts"] else None
        result.append(d)
    return result


def db_purge_expired() -> None:
    """Background thread: delete sessions past their expiry time."""
    while True:
        threading.Event().wait(300)   # every 5 minutes
        with get_db() as conn:
            conn.execute(
                "DELETE FROM sessions WHERE expires_at < ?",
                (datetime.now().isoformat(),),
            )


# ─────────────────────────────────────────────
# Gemini Configuration (STT & Translation & Clinical LLM)
# ─────────────────────────────────────────────
class GeminiLLM:
    """LangChain-compatible wrapper for Gemini 3.8 Flash."""
    def __init__(self, model, streaming: bool = False):
        self.model = model
        self.streaming = streaming

    def invoke(self, messages):
        prompt = messages[0].content if messages else ""
        res = self.model.generate_content(prompt)
        class Response:
            content = res.text if hasattr(res, "text") else ""
        return Response()

    def stream(self, messages):
        prompt = messages[0].content if messages else ""
        res = self.model.generate_content(prompt, stream=True)
        for chunk in res:
            try:
                txt = chunk.text
            except Exception:
                txt = ""
            if txt:
                class Chunk:
                    content = txt
                yield Chunk()


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
gemini_model = None
if GEMINI_API_KEY and genai:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_model = genai.GenerativeModel("gemini-3.8-flash")
        print("[AI] Gemini 3.8 Flash initialized for STT, Translation & Clinical LLM")
    except Exception as e:
        print(f"[AI] Gemini config warning: {e}")

# ─────────────────────────────────────────────
# LLM instances (Gemini / Groq / AWS Bedrock)
# ─────────────────────────────────────────────

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if GEMINI_API_KEY and gemini_model:
    print("[LLM] Using Gemini 3.8 Flash for clinical reasoning and triage")
    llm = GeminiLLM(gemini_model, streaming=False)
    llm_stream = GeminiLLM(gemini_model, streaming=True)
elif GROQ_API_KEY and ChatGroq:
    GROQ_MODEL = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    print(f"[LLM] Using Groq ({GROQ_MODEL})")
    llm = ChatGroq(
        model=GROQ_MODEL,
        api_key=GROQ_API_KEY,
        temperature=0,
        max_tokens=2048,
    )
    llm_stream = ChatGroq(
        model=GROQ_MODEL,
        api_key=GROQ_API_KEY,
        temperature=0,
        max_tokens=2048,
        streaming=True,
    )
elif ChatBedrock and boto3:
    region = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "ap-south-1"
    client_kwargs = {
        "service_name": "bedrock-runtime",
        "region_name": region,
    }
    if os.getenv("AWS_ACCESS_KEY_ID"):
        client_kwargs["aws_access_key_id"] = os.getenv("AWS_ACCESS_KEY_ID")
    if os.getenv("AWS_SECRET_ACCESS_KEY"):
        client_kwargs["aws_secret_access_key"] = os.getenv("AWS_SECRET_ACCESS_KEY")

    bedrock_client = boto3.client(**client_kwargs)
    BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "meta.llama3-70b-instruct-v1:0")
    print(f"[LLM] Using AWS Bedrock ({BEDROCK_MODEL_ID}) in {region}")

    llm = ChatBedrock(
        client=bedrock_client,
        model=BEDROCK_MODEL_ID,
        model_kwargs={
            "temperature": 0,
            "max_gen_len": 2048,
        },
    )
    llm_stream = ChatBedrock(
        client=bedrock_client,
        model=BEDROCK_MODEL_ID,
        model_kwargs={
            "temperature": 0,
            "max_gen_len": 2048,
        },
        streaming=True,
    )
else:
    raise RuntimeError("No LLM provider available! Please set GROQ_API_KEY in your environment.")

# ─────────────────────────────────────────────
# Markdown stripper
# ─────────────────────────────────────────────
def strip_markdown(text: str) -> str:
    text = re.sub(r'\*{1,3}(.*?)\*{1,3}', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ─────────────────────────────────────────────
# Thread-local token queue
# Used to route streamed tokens → SSE queue instead of stdout
# ─────────────────────────────────────────────
_tl = threading.local()


def stream_response(prompt: str, label: str) -> str:
    """
    Streams LLM tokens.
    - If called from an API request thread → puts tokens into _tl.token_queue
    - Otherwise → prints to terminal (CLI use)
    Returns the full stripped text.
    """
    q: Optional[queue.Queue] = getattr(_tl, "token_queue", None)
    full_text = ""

    for chunk in llm_stream.stream([HumanMessage(content=prompt)]):
        token = chunk.content
        if token:
            full_text += token
            if q is not None:
                q.put(("token", token))
            else:
                print(token, end="", flush=True)

    if q is not None:
        q.put(("done", None))    # sentinel → generator knows streaming finished
    else:
        print()

    return strip_markdown(full_text)


# ─────────────────────────────────────────────
# Body part validation
# ─────────────────────────────────────────────
VALID_BODY_PARTS = {
    # Face / head
    "jaw", "forehead",
    "leftEye",  "rightEye",
    "leftEar",  "rightEar",
    "nose",
    # Trunk
    "chest", "abdomen", "torso",
    # Shoulders
    "leftShoulder", "rightShoulder",
    # Arms
    "leftUpperArm",  "rightUpperArm",
    "leftElbow",     "rightElbow",
    "leftForearm",   "rightForearm",
    "leftHand",      "rightHand",
    # Legs
    "leftLeg",   "rightLeg",
    "leftKnee",  "rightKnee",
    "leftFoot",  "rightFoot",
}


def _parse_json_safe(raw: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    try:
        return json.loads(cleaned)
    except Exception:
        return {}


def _parse_list_safe(raw: str) -> list:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    try:
        result = json.loads(cleaned)
        return result if isinstance(result, list) else []
    except Exception:
        return []


def _resolve_body_parts_via_llm(user_input: str) -> List[str]:
    """Focused second LLM call when the extraction step misses body parts."""
    body_parts_list = ", ".join(sorted(VALID_BODY_PARTS))
    prompt = f"""
You are a body-part mapping specialist.
Return a JSON array (0–2 items) of the affected body parts from the patient message.

Allowed values (camelCase, exact spelling):
{body_parts_list}

Rules:
- Only values from the allowed list above.
- Map vague words: "arm" → rightUpperArm/leftUpperArm, "leg" → rightLeg/leftLeg,
  "stomach"/"belly" → abdomen, "hip"/"groin" → pelvis, "neck" → torso.
- If no body part: return [].
- Reply with ONLY the JSON array, no explanation.

Patient message: "{user_input}"
"""
    response = llm.invoke([HumanMessage(content=prompt)])
    candidates = _parse_list_safe(response.content)
    return [p for p in candidates if p in VALID_BODY_PARTS][:2]


# ─────────────────────────────────────────────
# LangGraph state & nodes
# ─────────────────────────────────────────────
class Medicalstate(TypedDict):
    chat_id:          str
    user_input:       str
    age:              int
    gender:           Literal["Male", "Female", "Other"]
    language:         str           # detected language for this session
    weight:           Optional[float]  # patient weight in kg (optional)
    structured_data:  dict
    emergency_status: Literal["emergency", "non_emergency",
                               "clarification_needed", "greeting", "none"]
    response:         str
    chat_history:     List[dict]   # last N turns for LLM context
    body_part_hint:   Optional[str]  # optional hint from frontend (e.g. body-map UI)


def format_chat_history(chat_history: List[dict]) -> str:
    if not chat_history:
        return "No previous conversation."
    lines = []
    for turn in chat_history:
        lines.append(f"Patient: {turn['user_input']}")
        lines.append(f"Assistant: {turn['assistant_response']}")
    return "\n".join(lines)


# ── Node 0: detect language ──────────────────
def detect_language(state: Medicalstate):
    prompt = f"""
    Detect the language of the following message.
    Reply with ONLY the language name in English.
    Example outputs: English, Hindi, Spanish, Tamil, French, Bengali, Marathi.

    Message:
    {state['user_input']}
    """
    response = llm.invoke([HumanMessage(content=prompt)])
    language = response.content.strip()
    # fallback: if the model returns a long explanation instead of a single word/name
    if len(language) > 30:
        language = "English"
    state["language"] = language
    return state


# ── Node 1: extract symptoms ──────────────────
def extract_symptoms(state: Medicalstate):
    history_text    = format_chat_history(state.get("chat_history", []))
    body_parts_list = ", ".join(sorted(VALID_BODY_PARTS))
    hint            = state.get("body_part_hint")
    hint_line       = f"\n    Frontend body part hint (strong suggestion, use it if it fits): {hint}" if hint else ""

    prompt = f"""
    You are a medical information extraction system.
    Age: {state['age']}, Gender: {state['gender']}
    {hint_line}

    Previous conversation:
    {history_text}

    Patient message: {state['user_input']}

    Return ONLY raw valid JSON (no markdown, no code fences):
    {{
      "symptoms":            [],
      "duration":            null,
      "severity":            null,
      "existing_conditions": [],
      "medications":         [],
      "allergies":           [],
      "body_parts":          []
    }}

    body_parts rules:
    - Only from: {body_parts_list}
    - Max 2 items, camelCase exactly as listed.
    - If a frontend hint is provided above, include it in body_parts.
    - Return [] if none identifiable.
    """

    response    = llm.invoke([HumanMessage(content=prompt)])
    data        = _parse_json_safe(response.content)

    raw_parts   = data.get("body_parts", [])
    valid_parts = (
        [p for p in raw_parts if p in VALID_BODY_PARTS][:2]
        if isinstance(raw_parts, list) else []
    )
    if not valid_parts:
        valid_parts = _resolve_body_parts_via_llm(state["user_input"])

    data["body_parts"] = valid_parts if valid_parts else None
    return {**state, "structured_data": data}


# ── Node 2: classify ──────────────────────────
def classify_emergency(state: Medicalstate):
    history_text = format_chat_history(state.get("chat_history", []))

    prompt = f"""
        You are a medical triage classifier.

        Your task is to classify the message as:

        - greeting → The message is a greeting, casual chat, or contains no medical symptoms
          (e.g. "hello", "hi", "how are you", "thanks", "okay", "bye")
        - emergency → Immediate medical care required (life-threatening risk)
        - non_emergency → Can wait for normal medical consultation
        - clarification_needed → Mentions health concerns but not enough detail to decide safely

    Previous conversation:
    {history_text}

    User Input: {state['user_input']}
    Age: {state['age']}, Gender: {state['gender']}
    Structured Data: {state['structured_data']}

    Respond with ONLY one word:
    greeting
    emergency
    non_emergency
    clarification_needed
    """

    response       = llm.invoke([HumanMessage(content=prompt)])
    classification = response.content.strip().lower()

    valid = ["greeting", "emergency", "non_emergency", "clarification_needed"]
    if classification not in valid:
        classification = "clarification_needed"

    state["emergency_status"] = classification
    return state


# ── Response nodes (all stream via stream_response) ──
def emergency_response(state: Medicalstate):
    history_text = format_chat_history(state.get("chat_history", []))
    body_parts = (state.get("structured_data") or {}).get("body_parts") or []
    body_parts_line = f"Affected body parts: {', '.join(body_parts)}" if body_parts else ""
    language = state.get("language", "English")
    prompt = f"""
    You are an empathetic medical professional giving urgent, life-saving guidance.
    IMPORTANT: Respond ONLY in {language} 100%. Do not switch languages or mix languages at any point or heading.

    {body_parts_line}

    The patient may be experiencing a medical emergency.

    Provide:
    1. Clear immediate actions.
    2. What NOT to do.
    3. Strong recommendation to contact emergency services.
    4. Keep it simple and urgent.
    Be direct and calm.

    DO NOT provide a diagnosis.
    DO NOT speculate.
    DO NOT provide complex medical procedures.

    Previous conversation:
    {history_text}

    Patient age: {state['age']}, gender: {state['gender']}
    Symptoms: {state['user_input']}
    Extracted data: {state['structured_data']}

    Response format:
    - Short urgent introduction
    - Step-by-step actions
    - Emergency contact instruction
    """
    state["response"] = stream_response(prompt, label="[EMERGENCY]")
    return state


def non_emergency_advice(state: Medicalstate):
    history_text = format_chat_history(state.get("chat_history", []))
    body_parts = (state.get("structured_data") or {}).get("body_parts") or []
    body_parts_line = f"Affected body parts: {', '.join(body_parts)}" if body_parts else ""
    language = state.get("language", "English")
    weight = state.get("weight")
    weight_line = f"Patient weight: {weight} kg" if weight is not None else ""
    prompt = f"""
You are a friendly and supportive medical assistant.

IMPORTANT LANGUAGE RULE:
Respond ONLY in {language} 100%. Do not switch languages or mix languages at any point or heading.

FORMAT RULE (MANDATORY):
Your response MUST contain EXACTLY these 4 numbered sections in this exact order.
Do NOT add extra sections.
Do NOT skip sections.
Do NOT change numbering.

1. [Translate “Suggested OTC Medications” into {language}]
2. [Translate “Home Remedies” into {language}]
3. [Translate “What to do and what not to do” into {language}]
4. [Translate “When to See a Doctor” into {language}]

After section 4, ALWAYS add:
5. A short follow-up question asking if they have any other concerns.

STYLE RULES:
- Write in plain conversational text.
- Do NOT use markdown, bold, asterisks, or bullet symbols.
- OTC medications must be shown as bullet points.
- Keep total response under 1800 characters.
- Be warm, calm, and reassuring.

MEDICAL SAFETY RULES:
- Suggest only Indian OTC (over-the-counter) medicines.
- Each medicine must be in bullet format.
- Include:
  - Medicine name
  - Safe dosage range according to age, gender and weight
  - Frequency shown using circle dots:
    ● once daily  
    ●● twice daily  
    ●●● three times daily  
    ●●●● four times daily
- Do NOT suggest antibiotics.
- Do NOT suggest injections.
- Do NOT suggest prescription-only medicines.
- Do NOT provide exact dosages for children.
- Do NOT claim a diagnosis — only mention possible common causes.
- Keep advice simple and safe.

{body_parts_line}

Previous conversation:
{history_text}

Patient age: {state['age']}, gender: {state['gender']}{(', weight: ' + str(weight) + ' kg') if weight is not None else ''}
Symptoms: {state['user_input']}
Extracted data: {state['structured_data']}

Now generate the response following the EXACT 4-section format.
"""
    state["response"] = stream_response(prompt, label="[Advice]")
    return state




def greeting_response(state: Medicalstate):
    history_text = format_chat_history(state.get("chat_history", []))
    language = state.get("language", "English")
    prompt = f"""
    You are a warm, friendly medical assistant having a natural conversation.
    IMPORTANT: Respond ONLY in {language}. Do not switch languages.
    If the patient is politely ending the conversation (like saying thank you or no thanks),
    respond briefly with if it's not first message:
    - A kind closing message
    - Wish them good health
    - Invite them to return if needed

    The patient just sent a casual message — respond naturally and in a human way.
    Then gently invite them to share how they are feeling or if anything is bothering them.
    Keep it short (2-3 sentences). Write in plain text, no markdown, no bullet points.

    Previous conversation:
    {history_text}

    Patient age: {state['age']}, gender: {state['gender']}
    Their message: "{state['user_input']}"

    Respond naturally now:
    """
    state["response"] = stream_response(prompt, label="")
    return state


def clarification_needed_response(state: Medicalstate):
    history_text = format_chat_history(state.get("chat_history", []))
    body_parts = (state.get("structured_data") or {}).get("body_parts") or []
    body_parts_line = f"Affected body parts: {', '.join(body_parts)}" if body_parts else ""
    language = state.get("language", "English")
    prompt = f"""
    You are a friendly medical assistant who needs a bit more detail before giving advice.
    IMPORTANT: Respond ONLY in {language} 100%. Do not switch languages or mix languages at any point or heading.
    Write in plain, conversational text.
    Ask 1 short, simple question numbered 1. Do not add any explanation or commentary.
    Use the previous conversation so you do NOT repeat questions already asked.
    {body_parts_line}

    Previous conversation:
    {history_text}

    Patient age: {state['age']}, gender: {state['gender']}
    Symptoms: {state['user_input']}
    Extracted data: {state['structured_data']}

    Ask your clarifying question now:
    """
    state["response"] = stream_response(prompt, label="[Question]")
    return state


# ─────────────────────────────────────────────
# LangGraph pipeline
# ─────────────────────────────────────────────
def route_emergency(state: Medicalstate) -> str:
    return {
        "greeting":             "greeting_response",
        "emergency":            "emergency_response",
        "non_emergency":        "non_emergency_advice",
        "clarification_needed": "clarification_needed_response",
    }.get(state["emergency_status"], "clarification_needed_response")


workflow = StateGraph(Medicalstate)
workflow.add_node("detect_language",               detect_language)
workflow.add_node("extract_symptoms",              extract_symptoms)
workflow.add_node("classify_emergency",            classify_emergency)
workflow.add_node("greeting_response",             greeting_response)
workflow.add_node("emergency_response",            emergency_response)
workflow.add_node("non_emergency_advice",          non_emergency_advice)
workflow.add_node("clarification_needed_response", clarification_needed_response)

workflow.add_edge(START, "detect_language")
workflow.add_edge("detect_language", "extract_symptoms")
workflow.add_edge("extract_symptoms", "classify_emergency")
workflow.add_conditional_edges(
    "classify_emergency", route_emergency,
    {
        "greeting_response":             "greeting_response",
        "emergency_response":            "emergency_response",
        "non_emergency_advice":          "non_emergency_advice",
        "clarification_needed_response": "clarification_needed_response",
    },
)
for node in ["greeting_response", "emergency_response",
             "non_emergency_advice", "clarification_needed_response"]:
    workflow.add_edge(node, END)

graph = workflow.compile()


# ─────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────
app = FastAPI(
    title="Medical Chatbot API",
    description="LangGraph-powered medical assistant with streaming SSE",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────
# Allow Vite dev server, Railway, and external web clients to reach the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:6004",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:6004",
    ],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────
class ChatRequest(BaseModel):
    chat_id:    Optional[str]   = Field(None, description="Omit to start a new session")
    message:    str             = Field(...,  description="Patient message")
    age:        Optional[int]   = Field(None, description="Required for new sessions (1-120)")
    gender:     Optional[str]   = Field(None, description="Required for new sessions: Male/Female/Other")
    weight:     Optional[float] = Field(None, description="Patient weight in kg (optional)")
    body_part:  Optional[str]   = Field(None, description="Optional body part hint from frontend (e.g. from a body-map UI). Must be a value from the valid body parts list (camelCase).")


class SessionLookupRequest(BaseModel):
    chat_ids: List[str]


class SessionSummary(BaseModel):
    chat_id:       str
    valid:         bool
    first_message: Optional[str] = None
    created_at:    Optional[str] = None


class SessionLookupRequest(BaseModel):
    chat_ids: List[str]


class SessionSummary(BaseModel):
    chat_id:       str
    valid:         bool
    first_message: Optional[str] = None
    created_at:    Optional[str] = None


class HistoryItem(BaseModel):
    id:                 int
    user_input:         str
    assistant_response: str
    emergency_status:   str
    body_parts:         Optional[List[str]]
    timestamp:          str


class HistoryResponse(BaseModel):
    chat_id: str
    turns:   int
    history: List[HistoryItem]


# ─────────────────────────────────────────────
# POST /chat  → SSE stream
# ─────────────────────────────────────────────
@app.post(
    "/chat",
    summary="Send a message and receive a streamed response",
    response_description="SSE stream: token events → metadata event → done event",
)
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    Stream format (each line is `data: <json>\\n\\n`):

        {"type": "token",    "content": "Hello"}
        {"type": "token",    "content": " there"}
        {"type": "metadata", "chat_id": "A1B2C3D4",
                             "emergency_status": "greeting",
                             "body_parts": ["rightUpperArm"]}   ← omitted if none
        {"type": "done"}
    """

    # ── Validate / load session ───────────────
    session = db_get_session(request.chat_id) if request.chat_id else None

    if session:
        chat_id  = session["chat_id"]
        age      = session["age"]
        gender   = session["gender"]
        language = session.get("language", "English")
        weight   = session.get("weight")  # may be None if not provided
        # Allow updating weight on an existing session if sent again
        if request.weight is not None:
            weight = request.weight
            with get_db() as conn:
                conn.execute("UPDATE sessions SET weight = ? WHERE chat_id = ?", (weight, chat_id))
    else:
        # New session – age + gender required
        if request.age is None or request.gender is None:
            raise HTTPException(
                status_code=422,
                detail="age and gender are required to start a new session.",
            )
        if not (1 <= request.age <= 120):
            raise HTTPException(status_code=422, detail="age must be between 1 and 120.")
        if request.gender.capitalize() not in ("Male", "Female", "Other"):
            raise HTTPException(status_code=422, detail="gender must be Male, Female, or Other.")

        chat_id  = str(uuid.uuid4())[:8].upper()
        age      = request.age
        gender   = request.gender.capitalize()
        weight   = request.weight
        language = "English"   # will be overwritten by detect_language node
        db_create_session(chat_id, age, gender, language, weight)

    # ── Load last 6 turns from SQLite for context ─
    history = db_get_history(chat_id, limit=6)

    # ── Build initial state ───────────────────
    # validate body_part hint if provided
    hint = request.body_part
    if hint and hint not in VALID_BODY_PARTS:
        hint = None   # silently ignore invalid values

    state: Medicalstate = {
        "chat_id":          chat_id,
        "user_input":       request.message,
        "age":              age,
        "gender":           gender,
        "language":         language,
        "weight":           weight,
        "structured_data":  {},
        "emergency_status": "none",
        "response":         "",
        "chat_history":     history,
        "body_part_hint":   hint,
    }

    # ── Token queue (SSE bridge) ──────────────
    token_q: queue.Queue = queue.Queue()
    results: dict = {}

    def _invoke_in_thread():
        """Run LangGraph pipeline in a background thread with token queue set."""
        _tl.token_queue = token_q          # stream_response will put tokens here
        results["final_state"] = graph.invoke(state)

    invoke_thread = threading.Thread(target=_invoke_in_thread, daemon=True)

    # ── SSE generator ─────────────────────────
    def sse_generator():
        invoke_thread.start()

        # 1. Stream tokens as they arrive
        while True:
            try:
                event, payload = token_q.get(timeout=60)
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'error', 'content': 'timeout'})}\n\n"
                return

            if event == "token":
                yield f"data: {json.dumps({'type': 'token', 'content': payload})}\n\n"
            elif event == "done":
                break   # streaming finished

        invoke_thread.join()

        # 2. Build metadata event
        final = results.get("final_state", {})
        body_parts = (final.get("structured_data") or {}).get("body_parts")

        meta: dict = {
            "type":             "metadata",
            "chat_id":          chat_id,
            "emergency_status": final.get("emergency_status", "none"),
        }
        if body_parts:                  # ← only include if detected
            meta["body_parts"] = body_parts

        yield f"data: {json.dumps(meta)}\n\n"

        # 3. Persist turn to SQLite + update detected language
        db_update_language(chat_id, final.get("language", "English"))
        db_save_turn(
            chat_id          = chat_id,
            user_input       = request.message,
            assistant_response = final.get("response", ""),
            emergency_status = final.get("emergency_status", "none"),
            body_parts       = body_parts,
        )

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",    # disable nginx buffering
            "Access-Control-Allow-Origin": "*",
        },
    )


# ─────────────────────────────────────────────
# DELETE /chat/{chat_id}  → end session immediately
# ─────────────────────────────────────────────
@app.delete(
    "/chat/{chat_id}",
    summary="End session and delete all data immediately",
)
async def end_session(chat_id: str):
    session = db_get_session(chat_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or already expired.")
    db_delete_session(chat_id)
    return {"message": f"Session {chat_id} deleted. All data wiped."}


# ─────────────────────────────────────────────
# GET /chat/{chat_id}/history  → full chat log
# ─────────────────────────────────────────────
@app.get(
    "/chat/{chat_id}/history",
    response_model=HistoryResponse,
    summary="Retrieve full chat history for a session",
)
async def get_history(chat_id: str):
    session = db_get_session(chat_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or expired.")
    history = db_get_full_history(chat_id)
    return HistoryResponse(
        chat_id=chat_id,
        turns=len(history),
        history=[HistoryItem(**h) for h in history],
    )


# ─────────────────────────────────────────────
# POST /sessions/lookup  → validate chat_ids in bulk
# ─────────────────────────────────────────────
@app.post(
    "/sessions/lookup",
    summary="Check which sessions are still alive and return their first message",
)
async def lookup_sessions(body: SessionLookupRequest):
    results: List[dict] = []
    for chat_id in body.chat_ids[:50]:      # cap at 50
        session = db_get_session(chat_id)
        if not session:
            results.append({"chat_id": chat_id, "valid": False})
            continue
        with get_db() as conn:
            first = conn.execute(
                "SELECT user_input FROM chat_history WHERE chat_id = ? ORDER BY id LIMIT 1",
                (chat_id,),
            ).fetchone()
        results.append({
            "chat_id":       chat_id,
            "valid":         True,
            "first_message": first["user_input"] if first else "",
            "created_at":    session["created_at"],
        })
    return {"sessions": results}


# ─────────────────────────────────────────────
# Gemini Speech-to-Text & Translation Endpoints
# ─────────────────────────────────────────────

class TranslateBody(BaseModel):
    input: str
    source_language_code: Optional[str] = "auto"
    target_language_code: Optional[str] = "en-IN"


@app.post("/stt", summary="Multimodal Speech-to-Text via Gemini")
async def speech_to_text_endpoint(file: UploadFile = File(...)):
    """Transcribe audio and detect language using Gemini Multimodal Audio understanding."""
    if not gemini_model:
        raise HTTPException(status_code=503, detail="Gemini API is not configured on the server.")
    try:
        audio_bytes = await file.read()
        mime_type = file.content_type or "audio/webm"
        
        prompt = (
            "Listen carefully to this audio recording of a patient describing their medical symptoms.\n"
            "1. Transcribe the exact words spoken in the original language.\n"
            "2. Translate the speech into clear English.\n"
            "3. Identify the BCP-47 language code (e.g. 'hi-IN', 'te-IN', 'ta-IN', 'bn-IN', 'mr-IN', 'en-IN', 'kn-IN', 'gu-IN', 'ml-IN', 'pa-IN', etc.).\n"
            "Return ONLY a valid JSON object in this exact schema, without any markdown formatting or commentary:\n"
            '{"transcript": "<original language text>", "english_transcript": "<english translation>", "language_code": "<bcp-47 code>"}'
        )
        
        response = gemini_model.generate_content([
            prompt,
            {"mime_type": mime_type, "data": audio_bytes}
        ])
        
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\n?", "", raw_text)
            raw_text = re.sub(r"\n?```$", "", raw_text)
            
        data = json.loads(raw_text)
        return {
            "transcript": data.get("transcript") or data.get("english_transcript", ""),
            "english_transcript": data.get("english_transcript", ""),
            "language_code": data.get("language_code", "en-IN"),
        }
    except Exception as err:
        print(f"Gemini STT error: {err}")
        raise HTTPException(status_code=500, detail=str(err))


@app.post("/translate", summary="Text translation via Gemini")
async def translate_text_endpoint(body: TranslateBody):
    """Translate text using Gemini, preserving any '~~~~' batch separators."""
    if not body.input.strip():
        return {"translated_text": body.input, "source_language_code": body.source_language_code}
        
    if not gemini_model:
        raise HTTPException(status_code=503, detail="Gemini API is not configured on the server.")
        
    try:
        prompt = (
            f"Translate the following text into the language with code '{body.target_language_code}'. "
            "If the text contains the separator '~~~~', preserve every '~~~~' separator in its exact relative position. "
            "Do not add any explanations, introductory text, or markdown codeblocks; return ONLY the translated string.\n\n"
            f"Text:\n{body.input}"
        )
        response = gemini_model.generate_content(prompt)
        translated = response.text.strip()
        return {
            "translated_text": translated,
            "source_language_code": body.source_language_code
        }
    except Exception as err:
        print(f"Gemini translation error: {err}")
        raise HTTPException(status_code=500, detail=str(err))


# ─────────────────────────────────────────────
# Startup / background tasks
# ─────────────────────────────────────────────
@app.on_event("startup")
def on_startup():
    init_db()
    # background thread: purge expired sessions every 5 min
    t = threading.Thread(target=db_purge_expired, daemon=True)
    t.start()
