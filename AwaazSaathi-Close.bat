@echo off
title AwaazSaathi - close
REM Closes the demo windows opened by AwaazSaathi-Open.bat.
REM If the server itself runs on THIS PC (scripts\windows\Run-Server-On-This-PC.bat), it is stopped too.
REM A server running on Dyen's Mac is NOT stopped from here; stop it on the Mac.
echo Closing AwaazSaathi...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\close-demo.ps1"
echo.
echo Done. You can close this window.
timeout /t 6 >nul
