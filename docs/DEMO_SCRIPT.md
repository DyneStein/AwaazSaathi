# 5-minute demo script (one Mac + one Android phone)

**Setup (before you walk up):** `./scripts/start.sh` is running. Three Chrome windows are side by side on the Mac: **/farmer** (left), **/expert** (right, narrow), **/admin** (hidden behind them). The Android phone shows **/dealer**, logged in as Aslam Zarai Markaz (PIN 1111), with **Turn on alert sound and vibration** tapped. Press **Reset demo** in /admin.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Farmer | Tap the green call button → **1** (Punjabi) → **1** → **1** wheat → **1** | "A farmer calls from any phone. First, the system tells them it's an AI." |
| 0:40 | Farmer | Speak the aphid question (or tap **Common** under the mic) | Point at **How the AI decided**: "It found the answer in expert-reviewed knowledge, confidence 0.44, all safety checks passed, so it answers by voice right away." |
| 1:20 | Farmer | **1** → ask the red-rot question (type it, or tap **Hard**) → **2** → **2** | "This isn't in our knowledge base. We don't let the AI guess, so an agronomist will call back." |
| 2:00 | Expert | Sign in as **Hamza (junior)** → open the question → write a draft → send. **Profile → Switch account → Dr. Ayesha (senior)** → open it → change a word (the diff shows) → **Approve with edits** | "Juniors draft, seniors approve. Scores are based on quality, not volume." |
| 3:00 | Farmer | The phone rings → accept → the answer plays | "The farmer gets a call back: no app, no reading." |
| 3:20 | Expert | **Add to knowledge base**. Optional: **Video call farmer** | "Now the AI knows this answer. For smartphone farmers, the agronomist can video call to see the crop." |
| 3:50 | Admin → phone | **Trigger outbreak** → the phone buzzes with the stock alert → **Confirm stock is ready** | "Three farmers in Okara this week means an outbreak. Dealers stock up before demand hits, and farmers get a voice alert." |
| 4:30 | — | Close | "AI where it's safe, humans where it matters, and a network that sees outbreaks first." |

If anything stalls: use the sample-question chips (cached, instant), or tick **Offline mode** in /admin.
