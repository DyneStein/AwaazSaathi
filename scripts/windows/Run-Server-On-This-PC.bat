@echo off
setlocal
REM Runs the whole AwaazSaathi server on this Windows PC (only needed when the Mac is not available).
REM To join a server that already runs on the Mac, use AwaazSaathi-Open.bat in the main folder instead.
cd /d "%~dp0..\.."
title AwaazSaathi - setup and run
echo ================================================================
echo  AwaazSaathi: one-click setup and run (Windows)
echo  First run downloads about 4 GB (AI models). Later runs start in seconds.
echo ================================================================
if not exist tools mkdir tools
if not exist backend\models mkdir backend\models

echo.
echo [1/8] Python manager (uv)
set "UV=%USERPROFILE%\.local\bin\uv.exe"
if not exist "%UV%" powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
if not exist "%UV%" (echo !! Could not install uv. Check the internet and run again. & pause & exit /b 1)

echo.
echo [2/8] ffmpeg (audio conversion)
set "FFMPEG_BIN=%CD%\tools\ffmpeg\ffmpeg.exe"
if not exist "%FFMPEG_BIN%" (
  curl -L --fail -o tools\ffmpeg.zip https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
  powershell -NoProfile -Command "Expand-Archive -Force tools\ffmpeg.zip tools\ffmpeg_x; New-Item -ItemType Directory -Force tools\ffmpeg | Out-Null; Get-ChildItem -Recurse tools\ffmpeg_x -Filter ffmpeg.exe | Select-Object -First 1 | Copy-Item -Destination tools\ffmpeg\ffmpeg.exe"
)
if not exist "%FFMPEG_BIN%" echo !! ffmpeg missing: spoken questions disabled, typed and sample questions still work.

echo.
echo [3/8] Speech-to-text engine (whisper.cpp)
set "WHISPER_BIN="
if not exist tools\whisper (
  curl -L --fail -o tools\whisper.zip https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip
  powershell -NoProfile -Command "Expand-Archive -Force tools\whisper.zip tools\whisper"
)
for /r tools\whisper %%F in (whisper-cli.exe) do if exist "%%F" set "WHISPER_BIN=%%F"
if "%WHISPER_BIN%"=="" for /r tools\whisper %%F in (main.exe) do if exist "%%F" set "WHISPER_BIN=%%F"
if "%WHISPER_BIN%"=="" echo !! whisper.cpp not found: spoken questions disabled, typed and sample questions still work.

echo.
echo [4/8] Whisper speech model (about 550 MB)
set "WHISPER_MODEL=%CD%\backend\models\ggml-large-v3-turbo-q5_0.bin"
if not exist "%WHISPER_MODEL%" curl -L --fail -C - -o "%WHISPER_MODEL%" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin

echo.
echo [5/8] Ollama + gemma3:4b language and vision model (about 3.3 GB)
set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if not exist "%OLLAMA%" (
  curl -L --fail -o "%TEMP%\OllamaSetup.exe" https://ollama.com/download/OllamaSetup.exe
  start /wait "" "%TEMP%\OllamaSetup.exe" /VERYSILENT /NORESTART
)
if exist "%OLLAMA%" (
  curl -s -m 3 http://localhost:11434/api/tags >nul || start "" /min "%OLLAMA%" serve
  timeout /t 4 >nul
  "%OLLAMA%" pull gemma3:4b
) else (
  echo !! Ollama not installed: photo analysis disabled, everything else works.
)

echo.
echo [6/8] Internet link tool (cloudflared, optional: lets phones join from any network)
if not exist tools\cloudflared.exe curl -L --fail -o tools\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
if not exist tools\cloudflared.exe echo !! cloudflared missing: phones must be on the same Wi-Fi as this PC.

echo.
echo [7/8] Python packages
pushd backend
"%UV%" sync
if errorlevel 1 (echo !! Package install failed. Check the internet and run again. & popd & pause & exit /b 1)

echo.
echo [8/8] Starting the AwaazSaathi server on port 8000
echo (If Windows Firewall asks about Python, click Allow.)
start "AwaazSaathi server - keep this window open" cmd /k ""%UV%" run uvicorn app.main:app --host 0.0.0.0 --port 8000"
popd
set /a N=0
:wait
set /a N+=1
curl -s -m 2 http://localhost:8000/api/health >nul && goto up
if %N% GEQ 60 (echo !! The server did not start. Look at the server window for the error. & pause & exit /b 1)
timeout /t 1 >nul
goto wait
:up
if exist "%OLLAMA%" curl -s http://localhost:11434/api/generate -d "{\"model\":\"gemma3:4b\",\"keep_alive\":\"60m\"}" >nul
start "" "http://localhost:8000/connect"
start "" "http://localhost:8000/farmer?device=stage"
start "" "http://localhost:8000/expert"
start "" "http://localhost:8000/admin"
echo.
echo Ready. The Connect page shows QR codes for the farmer, agronomist and dealer phones.
echo To stop: close the server window, or run AwaazSaathi-Close.bat.
timeout /t 8 >nul
