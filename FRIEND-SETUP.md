# AwaazSaathi demo: steps for a teammate's laptop (Windows)

> The server runs on **Dyen's Mac**. Start it there first (`scripts/mac/Start AwaazSaathi.command` or `./scripts/start.sh`).

## Join the demo (2 minutes)
1. Open https://github.com/DyneStein/AwaazSaathi, click the green **Code** button, then **Download ZIP**. Right-click the ZIP and choose **Extract All**. (Or `git pull` if you already have it.)
2. Double-click **AwaazSaathi-Open.bat**.
   - If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
3. **Same Wi-Fi or hotspot as the Mac:** it finds the Mac by itself.
   **Different network:** on the Mac open **Connect phones** (`/connect`), choose **Any network**, press **Turn on internet link**, and type that `https://...trycloudflare.com` link when the .bat asks.
4. Chrome opens: **Connect** (QR codes for the phones), the **Operations map**, **Farmer** and **Agronomist**. Click **Allow** when Chrome asks for the microphone.

## Close it
Double-click **AwaazSaathi-Close.bat**. It closes only the AwaazSaathi windows. The server on the Mac keeps running; stop it on the Mac with `scripts/mac/Stop AwaazSaathi.command`.

## Phones
Scan the QR codes on the Connect page: phone 1 = farmer (choose button phone or smartphone), phone 2 = agronomist, phone 3 = dealer (Aslam Zarai Markaz, PIN 1111). Voice works on both links. On the same Wi-Fi the phone warns once that the connection is not private (the certificate was made on the Mac): Android, tap Advanced then Proceed; iPhone, Show Details then visit this website.

## Run the whole server on Windows (only if the Mac is not available)
Double-click `scripts\windows\Run-Server-On-This-PC.bat`. The first run downloads about 4 GB (speech and language models) and takes about 45 minutes; later runs start in seconds. Allow Python through the Windows Firewall when asked. This script has not been tested on Windows yet; if a step fails it prints what is missing, and typed and sample questions still work.
