# Known limitations (say these honestly in Q&A)

1. **No real telco yet.** The button phone and the smartphone chat are simulators in the browser. Production needs an IVR/telco partner (e.g. a Pakistani CPaaS or a shortcode deal). The pipeline behind it is the same.
2. **Punjabi TTS.** There is no good free Pakistani Punjabi (Shahmukhi) voice, so replies are in Urdu with Punjabi-friendly words. Punjabi **speech recognition** goes through Whisper in Urdu script; accuracy on rural Punjabi accents is untested at scale.
3. **Small knowledge base, not yet expert-reviewed.** There are 18 entries, all flagged `needs_expert_review`, with generic advice only (no doses, no brand names). An agronomist must review them before any real use.
4. **Banned-chemical list is illustrative** and must be checked against the current Pakistan list.
5. **Free-tier quotas.** Gemini's free daily quota is small. We cache aggressively and fall back to Groq and then to local rules, but real traffic needs a paid tier.
6. **Retrieval is lexical** (character n-grams). It is fine for a small KB and works offline, but a larger KB needs multilingual embeddings.
7. **Outbreak detection is rule-based** (≥3 farmers / tehsil / 7 days) on farmer-reported symptoms, not lab-confirmed diagnoses. False alarms are possible, which is why outbreak-suspected answers always go to a senior.
8. **Mocked:** SMS/WhatsApp delivery, expert degree verification, payouts, and web push (replaced by an in-app banner with sound and vibration).
9. **Photo diagnosis** is a general vision model, not a trained plant-disease model. It feeds the same safety checks.
10. **Single-server demo** (SQLite, one process). Fine for a pilot, but scale-out needs Postgres and a queue.
11. **The safety evaluation is small and team-written** (56 questions). It shows the rules behave as designed and catches regressions; it does not measure accuracy with real farmers. Two Punjabi-dialect questions in it are sent to a human although the knowledge base covers them.
12. **Health-emergency detection is a short phrase list** (dizziness, vomiting, fainting, swallowed poison). It only decides that a human must take over and tells the caller to go to hospital; it is not medical triage.
13. **Knowledge sign-off is a button.** A senior can mark a starter entry as signed off in the app; in the demo data none are, and the screens say so.
14. **The map shows tehsil centres, not farms.** AwaazSaathi stores only a farmer's tehsil, so question dots are spread around the tehsil centre for display. The demo history (about 90 questions over 30 days, 54 farmers in 20 tehsils) is generated seed data, not field data.
15. **The internet link is a free Cloudflare quick tunnel** with a random address and no login. Anyone who has the link can open every screen, including demo control. It is for demos only; production needs real hosting with accounts.
16. **Phone microphones need https.** On the same-Wi-Fi `http://` link, phone browsers block the microphone, so the farmer phone sends listed or typed questions there. The internet link (https) allows speaking.

