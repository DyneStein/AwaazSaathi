@echo off
title AwaazSaathi - open the demo
REM Finds the AwaazSaathi server (Dyen's Mac) on this network and opens the QR page and all demo screens.
echo ================================================================
echo  IMPORTANT: this laptop, Dyen's Mac and the dealer phone must be
echo  on the SAME Wi-Fi or hotspot, and the server must be running on the Mac.
echo ================================================================
echo.
set "SERVER="
set /a TRY=0
:search
set /a TRY+=1
echo Looking for the AwaazSaathi server on this network (attempt %TRY% of 6)...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\find-server.ps1"`) do set "SERVER=%%i"
if not "%SERVER%"=="" goto found
if %TRY% GEQ 6 goto manual
echo   Not found yet. Retrying in 5 seconds... (check both are on the same network)
timeout /t 5 >nul
goto search

:manual
echo.
echo Could not find the server automatically after 6 attempts.
echo  - Are this laptop and the Mac on the SAME Wi-Fi or hotspot?
echo  - Is the server running on the Mac? (./scripts/start.sh)
echo  - The Mac's address is shown on the Mac at http://localhost:8000/connect
set /p "SERVER=Type the Mac's IP address (example 192.168.1.23), or press Enter to search again: "
if "%SERVER%"=="" (set /a TRY=0 & goto search)

:found
set "URL=http://%SERVER%:8000"
set /a CHECK=0
:check
set /a CHECK+=1
curl -s -m 6 %URL%/api/health | find "awaazsaathi" >nul
if not errorlevel 1 goto ok
if %CHECK% GEQ 5 (
  echo Cannot reach the server at %URL%.
  set "SERVER="
  goto manual
)
echo   Server not answering yet, retrying (%CHECK% of 5)...
timeout /t 3 >nul
goto check

:ok
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
echo If the network changes later, put everything on the new network and run this file again.
timeout /t 6 >nul
