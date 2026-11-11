# Pre-demo checklist

**30 minutes before**
- [ ] Laptop A on **the phone hotspot**, not the hackathon Wi-Fi. Laptop B and the Android phone on the same hotspot.
- [ ] Laptop A plugged in. Sleep disabled (`caffeinate -d` in a terminal).
- [ ] `./scripts/start.sh` is running. Note the printed IP.
- [ ] `cd backend && uv run python ../scripts/check_keys.py` → all PASS (or decide to run offline).
- [ ] `uv run python ../scripts/warm_cache.py` has been run at least once (it caches the voice for offline use).
- [ ] macOS asked "Allow incoming connections for Python?" → **Allow**. If the phone can't load the page: System Settings → Network → Firewall → allow Python.
- [ ] Phone: Chrome → `http://<IP>:8000/dealer` → log in (Okara, 1111) → **Enable alert sound & vibration**. Phone volume up, not in silent mode.
- [ ] Laptop B mic: browsers allow the mic only on HTTPS or localhost. In Chrome open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` → enter `http://<IP>:8000` → **Enabled** → Relaunch. Or run the farmer page on laptop A at `localhost`.
- [ ] Laptop B volume up, and connect a speaker if the room is loud.
- [ ] `/admin` → **Reset demo** right before going on stage.
- [ ] Backup video recorded (below).

**Record a backup video:** on a Mac press **Cmd+Shift+5** → *Record Entire Screen* (Options → Microphone: built-in, so the TTS is captured through the speaker). Run the whole demo script once and save it to the desktop. On Windows: **Win+Alt+R** (Xbox Game Bar).

# What if it breaks

| Problem | Fix (fastest first) |
|---|---|
| Internet or an API fails mid-demo | `/admin` → tick **Offline mode**. Use the sample-question chips. Cached voice and answers still play. |
| No voice plays | Is the Azure key missing or the quota spent? Answers still show as large Urdu text. Turn the volume up and check `/admin` → health. |
| Mic doesn't record on laptop B | The Chrome flag above, or use the chips or the type box. Or run `/farmer` on laptop A (localhost). |
| Phone can't open the dealer page | Same hotspot? Use the IP from `start.sh`, not localhost. Check the macOS firewall. Last resort: open `/dealer` on laptop A in a narrow window. |
| Phone doesn't buzz | Tap **Enable alert sound & vibration** again (Chrome needs a tap first). The banner still appears. |
| Callback doesn't ring | It rings only when the simulator is not in a call. Hang up first. The answer is also in the inbox below the phone. |
| Outbreak doesn't fire | Press **Reset demo**, then **Fire outbreak scenario** (it needs the seeded Okara case). |
| AI escalates the "common" question | Gemini's wording dropped the grounding score. Lower **Grounding min** in `/admin` (e.g. 0.4), or go offline, which uses the verbatim KB text. |
| Anything weird | **Reset demo** and continue from the current step. Everything is repeatable. |
| Server crashed | Ctrl+C, then `./scripts/start.sh` (about 5 s). The data survives. |
