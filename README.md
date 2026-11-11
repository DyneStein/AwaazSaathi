# AwaazSaathi · آواز ساتھی

A voice-first farm helpline for Punjab's farmers. Most of them use button phones and many cannot read well. A farmer calls, picks **Punjabi or Urdu**, and asks a question by voice. **The AI answers only when explicit rules say it is safe.** Everything else goes to **verified human agronomists** (junior drafts, senior approves) and comes back as a **voice callback**. Approved answers can be **promoted into the knowledge base**, so the AI learns. An **outbreak engine** watches the reports and alerts farmers and **dealers** ("stock these products") the moment a disease clusters in a tehsil.

**One brain, three doors:** phone call · WhatsApp (photo) · the dealer's shop.

What makes this different from AI-only helplines (e.g. Telenor's Kissan Dost Bashir, 7272): verified human experts on every risky answer, a dealer stock network, and outbreak alerts.

---

## Quick start (one command)

Requirements: macOS/Linux, Node 20+, [`uv`](https://docs.astral.sh/uv/) (Python manager). No Docker needed.

```bash
git clone https://github.com/DyneStein/AwaazSaathi && cd AwaazSaathi
cp .env.example .env        # then paste your free keys (see below), optional
./scripts/start.sh          # builds the UI, starts everything on :8000, prints LAN URLs + QR code
```

| App | URL | Who |
|---|---|---|
| Home | http://localhost:8000 | |
| Farmer call simulator | `/farmer` | farmer (2nd laptop) |
| Expert console | `/expert` | agronomists |
| Dealer app (PWA) | `/dealer` | dealer's Android phone |
| Presenter panel | `/admin` | you (reset, outbreak, offline switch) |
| API docs | `/docs` | |

- Reset the demo data: `./scripts/reset.sh` or the **Reset demo** button in `/admin`.
- Run the tests: `cd backend && uv run pytest`
- Check the keys: `cd backend && uv run python ../scripts/check_keys.py`
- Pre-generate the voice and cache the AI answers (needed for offline mode): `cd backend && uv run python ../scripts/warm_cache.py`. Then commit `backend/media/`.

Front-end dev with hot reload: `cd frontend && npm run dev` (proxies to the backend on :8000).

---

## Free services and keys

**The app runs with zero keys.** It falls back to the knowledge-base text, the browser's voice and typed or sample questions. Keys make it real.

| Key | What for | Free limit (checked Nov 2026; quotas change) | Get it |
|---|---|---|---|
| `GEMINI_API_KEY` | Understanding the question, composing the answer, leaf-photo vision | Small and per project (reports range from ~20 to a few hundred requests/day for Flash models). **Everything is cached**, so rehearsals don't burn it. | https://aistudio.google.com/apikey → *Create API key* |
| `GROQ_API_KEY` | Speech-to-text (Whisper large-v3, Urdu) + fallback LLM | ~2,000 requests/day, 28,800 audio-seconds/day | https://console.groq.com/keys → *Create API Key* |
| `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` | Urdu voice `ur-PK-AsadNeural` | F0: 0.5M characters/month | See below |
| Open-Meteo | Weather on outbreak cards | Free, no key | — |

**Azure for Students (no card):**
1. Go to https://azure.microsoft.com/free/students → *Start free* → sign in with your university email.
2. Open https://portal.azure.com → *Create a resource* → search **Speech** → *Speech service* → *Create*.
3. Fill in: Subscription *Azure for Students*, a new resource group `awaaz`, Region **Central India**, any name, Pricing tier **Free F0**. Then *Review + create* → *Create*.
4. *Go to resource* → **Keys and Endpoint** → copy **KEY 1** into `AZURE_SPEECH_KEY` and **Location/Region** (e.g. `centralindia`) into `AZURE_SPEECH_REGION`.

**Punjabi voice:** there is no good free Pakistani Punjabi (Shahmukhi) TTS. Azure only has `pa-IN` (Gurmukhi, Indian accent). Replies are therefore spoken in Urdu with Punjabi-friendly words (مونجی, کماد, کنک), as decided.

---

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the diagram.

1. **Call and triage (keypad, like an IVR):** language → AI disclosure → tehsil → crop → duration → **voice question**.
2. **STT:** Groq Whisper (`language=ur`), with Gemini audio as the fallback.
3. **Understand:** the LLM extracts crop, symptoms, a dose-question flag, chemicals named and spread words.
4. **RAG:** local character n-gram TF-IDF over the expert-reviewed knowledge base. The cosine score is the confidence.
5. **Compose:** the LLM rewrites **only from the retrieved text**. Offline, the verbatim KB text is used.
6. **Nil detection** (`backend/app/pipeline/nil_detection.py`): explicit rules, not the LLM's own opinion. It escalates on: retrieval < `RETRIEVAL_MIN`, grounding < `GROUNDING_MIN`, a dose question, a banned chemical, a suspected outbreak, or a senior-only topic. The thresholds are in `.env` and can be tuned live in `/admin`.
7. **Trust router:** the AI answer is spoken at once, or the caller hears "an expert will call you back" and the query enters the queue (outbreak > dose > normal; SLA timers; auto-reassign to another senior when the SLA is breached).
8. **Experts:** a junior drafts (text or voice) → a senior approves, edits and approves (with a diff), or rejects with a reason. Verified experts answer low-risk topics directly with random spot checks. Senior-only: dose, banned chemicals, outbreaks.
9. **Callback:** the approved answer → Azure TTS → the farmer's phone rings in the simulator (SMS/WhatsApp backup is *mocked*).
10. **Promote to KB:** a senior click turns the answer into a knowledge-base entry (`reviewed_by`, `reviewed_at`). The same question is then answered by the AI.
11. **Outbreak engine:** ≥3 distinct farmers, same tehsil, same problem, within 7 days → voice alert to the tehsil's farmers and a "stock these products" alert to dealers in and around it.
12. **Consent:** at the end, "1 = keep recording, 2 = delete". The audio is kept only on 1, and deleted otherwise.

**Expert scoring:** score = share of answers the senior approved **without major edits** (edit distance > 30% counts as major). Rejections lower it. Promotion: junior→verified at 20 reviewed and ≥80%; verified→senior at 100 and ≥90%. All values are in `backend/app/config.py`.

**Privacy:** only an HMAC-SHA256 of the phone number (secret `PHONE_HASH_SECRET`) and the tehsil are stored, never the raw number. The demo caller IDs exist only in the simulator.

**Data:** one SQLite file (`backend/var/awaaz.db`) with table groups `farmer_*`, `dealer_*`, `expert_*`, `core_*`. SQLite was chosen over Postgres for zero setup and an instant reset; the SQLAlchemy models move to Postgres with a URL change.

---

## What is mocked (be honest about it)

| Mocked | Where |
|---|---|
| Telco/IVR: the farmer "call" is a browser simulator | `/farmer` |
| SMS / WhatsApp delivery: logged, not sent | `EventLog kind=sms_mock` |
| Expert degree verification: an admin clicks approve | `/admin`, `expert.upload_degree` |
| Payouts: sponsor-funded balances are display only | `Expert.earnings_pkr` |
| Web push: replaced by a live in-app banner, sound and vibration (push needs HTTPS) | `/dealer` |
| Knowledge base: 18 entries, **all `needs_expert_review`**, generic advice, no doses or brand names | `backend/data/kb_seed.json` |
| Banned-chemical list: illustrative, must be checked against the current Pakistan list | `nil_detection.py` |

Demo docs: [Demo script](docs/DEMO_SCRIPT.md) · [Checklist and what-if guide](docs/CHECKLIST.md) · [Known limitations](docs/LIMITATIONS.md)
