# AwaazSaathi demo: steps for the Windows laptop

## Today (2 minutes): use the server already running on Dyen's Mac
1. Connect the Windows laptop to the SAME hotspot as Dyen's Mac (and the dealer's Android phone).
2. Open https://github.com/DyneStein/AwaazSaathi, click the green **Code** button, then **Download ZIP**. Right-click the ZIP and choose **Extract All**.
3. In the extracted folder, double-click **Open-Demo.bat**.
   - If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
4. It finds Dyen's Mac on the network by itself (about 2 seconds). Only if it can't, it asks for the IP: read it on the Mac at http://localhost:8000/connect.
5. Chrome opens 4 tabs: **Connect** (QR code), **Farmer**, **Expert** and **Admin**. Click **Allow** when Chrome asks for the microphone.
6. Dealer phone: scan the QR code on the Connect tab and log in as **Aslam Zarai Markaz**, PIN **1111**, then tap **Turn on alert sound and vibration**.
7. Before presenting: on the Admin tab press **Reset demo**.

**If the Wi-Fi or hotspot changes:** put both laptops and the phone on the new network, double-click **Open-Demo.bat** again (it finds the Mac's new address), and re-scan the QR code on the phone.

If Open-Demo.bat says it "cannot reach the Mac": check both are on the same hotspot, and that the server is running on the Mac (on the Mac run `./scripts/start.sh` in the AwaazSaathi folder).

## Later (first run about 45 minutes, about 4 GB download): run everything on the Windows laptop itself
1. Download and extract the ZIP as above (or `git clone`).
2. Double-click **AwaazSaathi-Setup-and-Run.bat**. It installs Python (uv), ffmpeg, whisper.cpp, the Whisper model, Ollama and gemma3, then starts the server and opens all screens.
3. When Windows Firewall asks about Python, click **Allow** (needed for the dealer phone).
4. Keep the "AwaazSaathi server" window open during the demo; close it to stop.
Next time, the same .bat starts in seconds. Note: this script has not been tested on Windows yet. If a step fails, it prints what is missing and the demo still runs with typed and sample questions.
