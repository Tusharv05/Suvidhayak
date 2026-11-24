/**
 * Backend API client
 * Connects to the FastAPI (api.py) server via SSE streaming.
 * Base URL is read from VITE_API_URL env var (defaults to localhost:8000).
 */

const API_BASE = (import.meta.env.VITE_API_URL as string);

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmergencyStatus =
  | 'greeting'
  | 'emergency'
  | 'non_emergency'
  | 'clarification_needed'
  | 'none';

export interface ChatMetadata {
  type: 'metadata';
  chat_id: string;
  emergency_status: EmergencyStatus;
  body_parts?: string[]; // only present when detected by the LLM
}

export interface StreamCallbacks {
  /** Called for each text token as it streams in */
  onToken: (token: string) => void;
  /** Called once after streaming, with session id + body parts + triage result */
  onMetadata: (meta: ChatMetadata) => void;
  /** Called when the stream is fully complete */
  onDone: () => void;
  /** Called on network / server errors */
  onError: (message: string) => void;
}

// ── POST /chat  (SSE streaming) ────────────────────────────────────────────────

export async function streamChat(
  params: {
    message: string;
    /** Provide to continue an existing session; omit for a new session */
    chatId?: string | null;
    /** Required only for new sessions */
    age?: number;
    /** Required only for new sessions ("Male" | "Female" | "Other") */
    gender?: string;
    /** Patient weight in kg (optional, can be sent on any turn to update the session) */
    weight?: number | null;
    /** Optional body part hint from the body-map UI (camelCase, from VALID_BODY_PARTS) */
    bodyPart?: string | null;
  },
  cb: StreamCallbacks,
): Promise<void> {
  // Build request body – only include defined / non-null fields
  const body: Record<string, unknown> = { message: params.message };
  if (params.chatId) body.chat_id = params.chatId;
  if (params.age !== undefined) body.age = params.age;
  if (params.gender) body.gender = params.gender;
  if (params.weight != null) body.weight = params.weight;
  if (params.bodyPart) body.body_part = params.bodyPart;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    cb.onError('Could not reach the server. Make sure the API is running on ' + API_BASE);
    return;
  }

  if (!res.ok) {
    try {
      const data = await res.json();
      cb.onError((data?.detail as string) ?? `Server error ${res.status}`);
    } catch {
      cb.onError(`Server error ${res.status}`);
    }
    return;
  }

  // Parse SSE stream line by line
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        switch (event.type) {
          case 'token':
            cb.onToken(event.content as string);
            break;
          case 'metadata':
            cb.onMetadata(event as unknown as ChatMetadata);
            break;
          case 'done':
            cb.onDone();
            break;
          case 'error':
            cb.onError(event.content as string);
            break;
        }
      } catch {
        /* skip malformed SSE lines */
      }
    }
  }
}

// ── DELETE /chat/{chat_id} ─────────────────────────────────────────────────────

export async function deleteSession(chatId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/chat/${chatId}`, { method: 'DELETE' });
  } catch {
    /* fire-and-forget – ignore network errors on cleanup */
  }
}

// ── GET /chat/{chat_id}/history ───────────────────────────────────────────────

export interface HistoryItem {
  id: number;
  user_input: string;
  assistant_response: string;
  emergency_status: EmergencyStatus;
  body_parts: string[] | null;
  timestamp: string;
}

export async function getHistory(chatId: string): Promise<HistoryItem[]> {
  const res = await fetch(`${API_BASE}/chat/${chatId}/history`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.history as HistoryItem[]) ?? [];
}

// ── POST /sessions/lookup ─────────────────────────────────────────────────

export interface SessionSummary {
  chat_id:        string;
  valid:          boolean;
  first_message?: string;
  created_at?:    string;
}

export async function lookupSessions(chatIds: string[]): Promise<SessionSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/sessions/lookup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_ids: chatIds }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.sessions as SessionSummary[]) ?? [];
  } catch {
    return [];
  }
}

// ── Speech-to-Text & Translation (Gemini Backend / Sarvam Fallback) ────────

const SARVAM_API_KEY = (import.meta.env.VITE_SARVAM_API_KEY as string) || '';
const SARVAM_BASE = 'https://api.sarvam.ai';

export interface STTResult {
  transcript: string;
  language_code: string;
}

/** Speech-to-text + translate: records audio → returns transcript + detected language via Gemini */
export async function speechToTextTranslate(file: File): Promise<STTResult> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  // 1. Try our backend Gemini STT endpoint
  try {
    const res = await fetch(`${API_BASE}/stt`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      return (await res.json()) as STTResult;
    }
  } catch (err) {
    console.warn('Backend Gemini STT call failed, falling back:', err);
  }

  // 2. Fallback to Sarvam if API key exists
  if (SARVAM_API_KEY) {
    const res = await fetch(`${SARVAM_BASE}/speech-to-text-translate`, {
      method: 'POST',
      headers: { 'api-subscription-key': SARVAM_API_KEY },
      body: formData,
    });
    if (res.ok) {
      return (await res.json()) as STTResult;
    }
  }

  throw new Error('STT service unavailable.');
}

export interface TranslateResult {
  translated_text: string;
  source_language_code: string;
}

const TRANSLATE_MAX_CHARS = 900;
const BATCH_SEP = '~~~~';

/** Single raw API call — routes via Gemini backend */
async function _translateSingle(
  input: string,
  source_language_code: string,
  target_language_code: string,
): Promise<TranslateResult> {
  // 1. Try our backend Gemini translate endpoint
  try {
    const res = await fetch(`${API_BASE}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, source_language_code, target_language_code }),
    });
    if (res.ok) {
      return (await res.json()) as TranslateResult;
    }
  } catch (err) {
    console.warn('Backend Gemini translate failed, falling back:', err);
  }

  // 2. Fallback to Sarvam if API key exists
  if (SARVAM_API_KEY) {
    const res = await fetch(`${SARVAM_BASE}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': SARVAM_API_KEY,
      },
      body: JSON.stringify({ input, source_language_code, target_language_code }),
    });
    if (res.ok) {
      return (await res.json()) as TranslateResult;
    }
  }

  return { translated_text: input, source_language_code };
}

/**
 * Translate text of any length.
 * Automatically splits into ≤900-char chunks when needed:
 *  - Batch text (containing '~~~~') is split on that separator.
 *  - Plain text is split at sentence boundaries.
 * All callers continue to receive a single TranslateResult.
 */
export async function translateText(
  input: string,
  source_language_code = 'auto',
  target_language_code = 'en-IN',
): Promise<TranslateResult> {
  if (!input.trim()) return { translated_text: input, source_language_code };

  // ── Fast path: fits in one request ──────────────────────────────────────
  if (input.length <= TRANSLATE_MAX_CHARS) {
    return _translateSingle(input, source_language_code, target_language_code);
  }

  // ── Batch text (contains '~~~~') ────────────────────────────────────────
  if (input.includes(BATCH_SEP)) {
    const segments = input.split(BATCH_SEP);

    // Group segments into chunks that each fit in TRANSLATE_MAX_CHARS
    const groups: string[][] = [];
    let group: string[] = [];
    let groupLen = 0;

    for (const seg of segments) {
      const sep = group.length > 0 ? BATCH_SEP.length : 0;
      if (groupLen + sep + seg.length > TRANSLATE_MAX_CHARS && group.length > 0) {
        groups.push(group);
        group = [seg];
        groupLen = seg.length;
      } else {
        groupLen += sep + seg.length;
        group.push(seg);
      }
    }
    if (group.length > 0) groups.push(group);

    // Translate each group sequentially (preserves order, avoids rate-limits)
    const translatedGroups: string[] = [];
    let detectedSource = source_language_code;
    for (const g of groups) {
      const r = await _translateSingle(
        g.join(BATCH_SEP),
        source_language_code,
        target_language_code,
      );
      translatedGroups.push(r.translated_text ?? g.join(BATCH_SEP));
      if (r.source_language_code && r.source_language_code !== 'auto') {
        detectedSource = r.source_language_code;
      }
    }

    return {
      translated_text: translatedGroups.join(BATCH_SEP),
      source_language_code: detectedSource,
    };
  }

  // ── Plain long text: split at sentence / paragraph boundaries ─────────────
  // Split after '. ', '! ', '? ', or at newlines
  const rawParts = input.split(/(?<=[.!?])\s+|(?<=\n)/g);
  const chunks: string[] = [];
  let current = '';

  for (const part of rawParts) {
    if (part.length > TRANSLATE_MAX_CHARS) {
      // Single part too long — break at word boundaries
      if (current) { chunks.push(current.trimEnd()); current = ''; }
      const words = part.split(' ');
      for (const word of words) {
        if (current.length + word.length + 1 > TRANSLATE_MAX_CHARS) {
          if (current) chunks.push(current.trimEnd());
          current = word;
        } else {
          current += (current ? ' ' : '') + word;
        }
      }
    } else if (current.length + part.length + 1 > TRANSLATE_MAX_CHARS) {
      if (current) chunks.push(current.trimEnd());
      current = part;
    } else {
      current += (current ? ' ' : '') + part;
    }
  }
  if (current.trim()) chunks.push(current.trimEnd());

  // Translate each chunk sequentially
  const parts: string[] = [];
  let detectedSource = source_language_code;
  for (const chunk of chunks) {
    const r = await _translateSingle(chunk, source_language_code, target_language_code);
    parts.push(r.translated_text ?? chunk);
    if (r.source_language_code && r.source_language_code !== 'auto') {
      detectedSource = r.source_language_code;
    }
  }

  return {
    translated_text: parts.join(' '),
    source_language_code: detectedSource,
  };
}

// ── GPS / Geolocation ─────────────────────────────────────────────────────────

export interface GPSCoords {
  latitude: number;
  longitude: number;
}

/**
 * Request the device's GPS coordinates via the browser Geolocation API.
 * Resolves with { latitude, longitude } or rejects with an error message string.
 */
export function getGPSCoords(options?: PositionOptions): Promise<GPSCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve({ latitude, longitude });
      },
      (err) => reject(err.message),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options,
      },
    );
  });
}

export interface TTSResult {
  audios: string[]; // base64-encoded WAV audio chunks
}

/** Text-to-speech: returns base64 WAV audio array */
export async function textToSpeech(
  text: string,
  target_language_code: string,
  speaker = 'shubh',
  model = 'bulbul:v3',
): Promise<TTSResult> {
  const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': SARVAM_API_KEY,
    },
    body: JSON.stringify({ inputs: [text], target_language_code, speaker, model }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`TTS failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<TTSResult>;
}
