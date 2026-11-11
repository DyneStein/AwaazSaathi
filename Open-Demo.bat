@echo off
title AwaazSaathi - open the demo
REM Finds the AwaazSaathi server (Dyen's Mac) on this network and opens the QR page and all demo screens.
REM The laptops and the dealer phone only need to be on the same Wi-Fi or hotspot.
echo Looking for the AwaazSaathi server on this network...
set "SERVER="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\find-server.ps1"`) do set "SERVER=%%i"
if "%SERVER%"=="" (
  echo.
  echo Could not find it automatically.
  echo  - Is the Mac on the same Wi-Fi or hotspot as this laptop?
  echo  - Is the server running on the Mac? ^(./scripts/start.sh^)
  echo The Mac's address is shown on the Mac at http://localhost:8000/connect
  set /p "SERVER=Type the Mac's IP address (example 192.168.1.23) and press Enter: "
)
if "%SERVER%"=="" exit /b 1
set "URL=http://%SERVER%:8000"
curl -s -m 6 %URL%/api/health | find "awaazsaathi" >nul
if errorlevel 1 (
  echo Cannot reach the server at %URL%. Check the network and try again.
  pause
  exit /b 1
)
echo Found the server at %URL%
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" (
  echo Chrome not found. Opening the default browser - the microphone may not work there.
  start "" "%URL%/connect"
  start "" "%URL%/farmer"
  start "" "%URL%/expert"
  start "" "%URL%/admin"
  exit /b 0
)
REM A separate Chrome profile lets this network address use the microphone and camera without HTTPS.
start "" "%CHROME%" --user-data-dir="%TEMP%\awaazsaathi-chrome" --unsafely-treat-insecure-origin-as-secure=%URL% --no-first-run --new-window "%URL%/connect" "%URL%/farmer" "%URL%/expert" "%URL%/admin"
echo Opened. Allow the microphone when Chrome asks.
echo If the network changes later, just run this file again.
timeout /t 5 >nul
