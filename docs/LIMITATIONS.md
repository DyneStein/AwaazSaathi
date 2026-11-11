# Known limitations (say these honestly in Q&A)

1. **No real telco yet.** The call is a browser simulator. Production needs an IVR/telco partner (e.g. a Pakistani CPaaS or a shortcode deal). The pipeline behind it is the same.
2. **Punjabi TTS.** There is no good free Pakistani Punjabi (Shahmukhi) voice, so replies are in Urdu with Punjabi-friendly words. Punjabi **speech recognition** goes through Whisper in Urdu script; accuracy on rural Punjabi accents is untested at scale.
3. **Small knowledge base, not yet expert-reviewed.** There are 18 entries, all flagged `needs_expert_review`, with generic advice only (no doses, no brand names). An agronomist must review them before any real use.
4. **Banned-chemical list is illustrative** and must be checked against the current Pakistan list.
5. **Free-tier quotas.** Gemini's free daily quota is small. We cache aggressively and fall back to Groq and then to local rules, but real traffic needs a paid tier.
6. **Retrieval is lexical** (character n-grams). It is fine for a small KB and works offline, but a larger KB needs multilingual embeddings.
7. **Outbreak detection is rule-based** (≥3 farmers / tehsil / 7 days) on farmer-reported symptoms, not lab-confirmed diagnoses. False alarms are possible, which is why outbreak-suspected answers always go to a senior.
8. **Mocked:** SMS/WhatsApp delivery, expert degree verification, payouts, and web push (replaced by an in-app banner with sound and vibration).
9. **Photo diagnosis** is a general vision model, not a trained plant-disease model. It feeds the same safety checks.
10. **Single-server demo** (SQLite, one process). Fine for a pilot, but scale-out needs Postgres and a queue.
