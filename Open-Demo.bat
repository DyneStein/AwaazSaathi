@echo off
title AwaazSaathi - open the demo
REM Opens the QR page and all demo screens from the AwaazSaathi server running on the Mac.
REM Both laptops and the dealer phone must be on the same hotspot.
set "MAC=192.168.137.245"
set /p "IN=Mac IP address (press Enter for %MAC%): "
if not "%IN%"=="" set "MAC=%IN%"
set "URL=http://%MAC%:8000"
echo Checking %URL% ...
curl -s -m 6 %URL%/api/health >nul
if errorlevel 1 (
  echo.
  echo Cannot reach the Mac at %URL%.
  echo  - Is the Mac on the same hotspot?
  echo  - Is the AwaazSaathi server running on the Mac?
  pause
  exit /b 1
)
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
REM A separate Chrome profile lets this LAN address use the microphone and camera without HTTPS.
start "" "%CHROME%" --user-data-dir="%TEMP%\awaazsaathi-chrome" --unsafely-treat-insecure-origin-as-secure=%URL% --no-first-run --new-window "%URL%/connect" "%URL%/farmer" "%URL%/expert" "%URL%/admin"
echo Opened. Allow the microphone when Chrome asks.
timeout /t 4 >nul
