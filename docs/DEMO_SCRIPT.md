# 8-minute demo script

**Setup:** Laptop A runs the server, `/admin` and `/expert`. Laptop B runs `/farmer` (or a second window on A). The Android phone runs `/dealer`, logged in as **Aslam Zarai Markaz (Okara), PIN 1111**, with **Enable alert sound & vibration** tapped. Press **Reset demo** in `/admin` just before you start.

| # | Time | Screen | Do | Say |
|---|---|---|---|---|
| 0 | 0:00 | Home | — | "60% of Punjab's farmers have button phones. AwaazSaathi is a helpline where the AI answers only what it is sure of, and humans answer the rest." |
| 1 | 0:45 | Farmer | Caller **03001197… · Faisalabad** (default). Call → **1** (Punjabi) → AI notice → **1** (tehsil OK) → **1** wheat → **1** under 3 days → speak, or tap **▶ Common: wheat aphid** | "First it says clearly that you're talking to an AI." Point at **Behind the scenes**: retrieval 0.44 ≥ 0.30, grounded, all checks passed → answer spoken at once. |
| 2 | 2:00 | Farmer | **1** (another question) → type or tap the red-rot question (sugarcane, "گنے اندر سے لال…") | "The knowledge base doesn't cover this. Retrieval 0.2 is below the threshold, so we **don't let the AI guess**." The caller hears "an expert will call you back". Then **2** → consent **1 or 2**, which ends the call. |
| 3 | 3:00 | Expert | Sign in as **Hamza Tariq (junior)** → open the query → type a draft → **Submit draft**. **Switch** → **Dr. Ayesha Malik (senior)** → open **Draft ready** → edit a word → show the **diff** → **Edit & approve** | "Juniors are fresh graduates and can only draft. A senior approves. Score = share approved without major edits, not volume." |
| 4 | 4:30 | Farmer | The phone **rings: Incoming call: AwaazSaathi Expert** → accept → the answer is spoken | "The farmer gets a call back: no app, no reading." |
| 5 | 5:15 | Expert | **Answered** tab → **📚 Promote to knowledge base**. Then in `/admin` press **▶ Hard: sugarcane red rot**, which is now `answered_ai` (or call again from the farmer page) | "The expert's answer becomes knowledge. Next farmer, the AI answers instantly." |
| 6 | 6:00 | Admin + phone | `/admin` → **⚠ Fire outbreak scenario**. The counter ticks 1→2→3 in Okara. The **phone buzzes**: outbreak banner + stock card → tap **I have stock ready** | "3 farmers, same tehsil, 7 days → the outbreak engine alerts farmers by voice and dealers to stock up before demand hits." |
| 7 | 7:15 | Farmer | Pick an **Okara** caller → the outbreak alert is in the inbox → ▶ Play | Close: "One brain, three doors. AI where it's safe, humans where it matters, and a network that sees outbreaks first." |

**Backup moves:** if the internet drops, toggle **Offline mode** in `/admin` and use the sample-question chips (they replay cached answers). If the mic fails, use the chips or type.
