@echo off
title AwaazSaathi - open the demo
REM Connects this laptop to the AwaazSaathi server (running on Dyen's Mac) and opens the demo screens.
REM Same Wi-Fi: it finds the Mac by itself. Different network: paste the https internet link from the Mac's Connect page.
REM To close the screens again, run AwaazSaathi-Close.bat.
echo ================================================================
echo  AwaazSaathi demo
echo  The server must already be running on the Mac.
echo  Same Wi-Fi or hotspot as the Mac: the Mac is found automatically.
echo  Different network: type the internet link shown on the Mac
echo  (Connect phones page, "Any network").
echo ================================================================
echo.
set "SERVER="
set "URL="
set /a TRY=0
:search
set /a TRY+=1
echo Looking for the AwaazSaathi server on this network (attempt %TRY% of 4)...
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\find-server.ps1"`) do set "SERVER=%%i"
if not "%SERVER%"=="" goto found
if %TRY% GEQ 4 goto manual
echo   Not found yet. Retrying in 4 seconds...
timeout /t 4 >nul
goto search

:manual
echo.
echo Could not find the server on this network.
echo  - Same Wi-Fi: is this laptop on the SAME Wi-Fi or hotspot as the Mac?
echo  - Is the server running on the Mac? (Start AwaazSaathi, or ./scripts/start.sh)
echo  - Different network: on the Mac open Connect phones, choose "Any network",
echo    turn on the internet link and type it here.
set "SERVER="
set /p "SERVER=Mac IP (example 192.168.1.23) or internet link (https://...), or Enter to search again: "
if "%SERVER%"=="" (set /a TRY=0 & goto search)

:found
REM An address that starts with http is used as it is; a bare IP gets the port.
set "URL=http://%SERVER%:8000"
if /i "%SERVER:~0,4%"=="http" set "URL=%SERVER%"
if "%URL:~-1%"=="/" set "URL=%URL:~0,-1%"
set /a CHECK=0
:check
set /a CHECK+=1
curl -s -m 8 "%URL%/api/health" | find "awaazsaathi" >nul
if not errorlevel 1 goto ok
if %CHECK% GEQ 4 (
  echo Cannot reach the server at %URL%.
  goto manual
)
echo   Server not answering yet, retrying (%CHECK% of 4)...
timeout /t 3 >nul
goto check

:ok
echo Connected to the server at %URL%
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" (
  echo Chrome not found. Opening the default browser - the microphone may not work there.
  start "" "%URL%/connect"
  start "" "%URL%/admin"
  start "" "%URL%/farmer?device=stage"
  start "" "%URL%/expert"
  goto done
)
REM Its own Chrome profile: lets a local http address use the microphone, and lets AwaazSaathi-Close.bat close exactly these windows.
start "" "%CHROME%" --user-data-dir="%TEMP%\awaazsaathi-chrome" --unsafely-treat-insecure-origin-as-secure=%URL% --no-first-run --no-default-browser-check --new-window "%URL%/connect" "%URL%/admin" "%URL%/farmer?device=stage" "%URL%/expert"
echo Opened: Connect (QR codes for phones), Operations map, Farmer, Agronomist.
echo Allow the microphone when Chrome asks.

:done
echo.
echo To close these screens later, double-click AwaazSaathi-Close.bat.
echo If the Wi-Fi changes, run this file again.
timeout /t 8 >nul
