# Suvidhayak (Swasthya Sahayak - स्वास्थ्य सहायक) 🩺

**Suvidhayak** is an AI-powered multilingual clinical triage and first-aid guidance assistant designed to provide immediate, context-aware health advice, symptom triage, and automated emergency hospital routing.

---

## 🌟 Key Features

- **Interactive 2D Body Map**: Select affected body regions (Head, Chest, Abdomen, Limbs, etc.) to seed clinical reasoning with targeted anatomical context.
- **Multi-Stage LangGraph Clinical Pipeline**: Powered by LangGraph and LLMs (Google Gemini 3.8 Flash, Groq Qwen 3.8-27B, or AWS Bedrock Llama 3 70B) to perform symptom triage, red-flag screening, OTC medicine suggestions, and home remedies.
- **Real-Time Token Streaming**: Low-latency Server-Sent Events (SSE) provide word-by-word guidance without UI lag.
- **Multilingual & Voice-First**:
  - Live voice dictation via Web Speech API and backend multimodal STT.
  - Native Hindi and regional language support with localized greetings and guidance.
  - Text-to-Speech (TTS) readout of clinical advice.
- **Automated Emergency & Hospital Guidance**:
  - Automatically flags life-threatening symptoms (`emergency_status === 'emergency'`).
  - Queries real-time healthcare facilities via **Geoapify Places API** within a 5 km to 20 km radius.
  - Displays driving distance, estimated travel time, one-tap calling (`tel:`), direct national emergency hotline (`112`), and Google Maps turn-by-turn navigation.
  - Flexible location controls: auto GPS detection, city/pincode search, and persistent location memory.

---

## 🏗️ Architecture

```
                      ┌──────────────────────────────────────────────┐
                      │              React + Vite UI                 │
                      │ (Body Map, Voice STT, Live Chat, Hospital Map)│
                      └──────────────────────┬───────────────────────┘
                                             │ HTTP / SSE
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │             FastAPI Backend (api.py)         │
                      └──────┬───────────────────────┬───────────────┘
                             │                       │
                             ▼                       ▼
            ┌────────────────────────────────┐ ┌─────────────────────┐
            │   LangGraph Clinical Engine    │ │   Geoapify API      │
            │  (Triage, Red Flags, Remedies) │ │ (Hospitals, Clinics)│
            └────────────────┬───────────────┘ └─────────────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │ Primary: Google Gemini Flash   │
            │ Fallback: Groq / AWS Bedrock   │
            └────────────────────────────────┘
```

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Backend**: FastAPI, Uvicorn, LangGraph, SQLite (Session state & history)
- **AI / LLMs**: Google Gemini 3.8 Flash (`google-generativeai`), Groq (`langchain-groq`), AWS Bedrock (`langchain-aws`)
- **Location Services**: Geoapify Places & Geocoding APIs

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- (Optional) API Keys: Google Gemini API Key, Groq API Key, Geoapify API Key

---

### 1. Clone the Repository
```bash
git clone https://github.com/Tusharv05/Suvidhayak.git
cd Suvidhayak
```

### 2. Backend Setup
1. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the root directory:
   ```env
   VITE_API_URL=http://localhost:8000
   VITE_GEOAPIFY_API_KEY=your_geoapify_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ```
4. Start the backend:
   ```bash
   uvicorn api:app --host 0.0.0.0 --port 8000 --reload
   ```
   API Documentation available at: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 3. Frontend Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the Vite development server:
   ```bash
   npm run dev -- --host 0.0.0.0 --port 6004
   ```
3. Open your browser at: [http://localhost:6004/](http://localhost:6004/)

---

## 🚢 Deployment

The repository includes ready-to-deploy configurations for **Railway**:
- `Procfile`: Configures backend server command.
- `railway.json`: Deployment builder settings.
- `requirements.txt`: Python dependencies.

---

## 🔒 Privacy & Safety Notice
Suvidhayak provides first-aid guidance and triage information for educational and rapid support purposes only. It is **not** a substitute for professional clinical diagnosis or hospital emergency care. In critical situations, immediately contact local emergency services (**112 in India**) or visit the nearest hospital.
