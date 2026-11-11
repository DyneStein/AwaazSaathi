# Architecture

One FastAPI process serves the API, the WebSocket and the built React app on **port 8000**. One SQLite database. Everything external is cached and has a fallback.

```mermaid
flowchart LR
    subgraph Doors["Three doors"]
      F["📞 Farmer call<br/>(button phone · simulator)"]
      W["📷 WhatsApp photo"]
      D["🏪 Dealer app (PWA)"]
    end

    F --> VG["Voice gateway<br/>keypad triage: language · tehsil · crop · duration"]
    VG --> STT["Speech-to-text<br/>Groq Whisper (ur) → Gemini fallback"]
    W --> VIS["Vision<br/>Gemini Flash"]
    STT --> U["Understand<br/>LLM → crop, symptoms, dose?, chemicals, spread"]
    VIS --> U
    U --> RAG["RAG retrieval<br/>TF-IDF over expert-reviewed KB<br/>score = confidence"]
    RAG --> C["Compose ONLY from sources"]
    C --> NIL{"Nil detection<br/>(explicit rules)<br/>low retrieval · not grounded ·<br/>dose · banned chemical ·<br/>suspected outbreak · senior-only"}
    NIL -- safe --> TTS["TTS · Azure ur-PK<br/>(cached mp3)"]
    TTS --> F
    NIL -- escalate --> Q["Expert queue<br/>priority + SLA + auto-reassign"]
    Q --> J["Junior drafts"]
    J --> S["Senior reviews<br/>approve · edit · reject"]
    S --> CB["Voice callback<br/>(+ SMS/WhatsApp mock)"]
    CB --> F
    S -- "promote" --> KB[("Knowledge base")]
    KB --> RAG
    U --> OB["Outbreak engine<br/>≥3 farmers · same tehsil · 7 days"]
    OB --> FA["Farmer voice alerts"]
    OB --> DA["Dealer: stock these products"]
    DA --> D
```

## Components

| Piece | File |
|---|---|
| Trust router (whole pipeline) | `backend/app/pipeline/router.py` |
| Nil detection rules | `backend/app/pipeline/nil_detection.py` |
| Retrieval | `backend/app/pipeline/retrieval.py` |
| STT / LLM / TTS / vision | `stt.py`, `llm.py`, `tts.py` |
| Outbreak engine | `backend/app/pipeline/outbreak.py` |
| Scoring and promotion | `backend/app/pipeline/scoring.py` |
| Expert workflow + SLA sweep | `backend/app/api/expert.py` |
| Real-time | `backend/app/ws.py` (one WebSocket, topics `farmer:<id>`, `expert`, `dealer`, `outbreak`, `admin`) |
| Cache (offline replay) | `backend/app/pipeline/cache.py` → `backend/media/cache`, `backend/media/tts` |

## Reliability design
- **Every AI call is cached** by input hash, so rehearsed questions replay instantly and identically, and the free quota is spent once.
- **Fallback chain:** Groq → Gemini → offline rules. The LLM is never needed to decide escalation.
- **Offline switch** (`/admin`): no network calls. It uses cached audio, the KB text verbatim, and typed or sample questions.
- **Explicit thresholds** in `.env`, tunable live.
