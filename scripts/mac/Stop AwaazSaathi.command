#!/bin/bash
# Double-click to stop the AwaazSaathi server and free the memory used by the AI model.
# The Mac stays awake (no sleep) on purpose. To allow sleep again: restart the Mac, or run: pkill caffeinate
echo "Stopping AwaazSaathi..."
if pkill -f "uvicorn app.main:app"; then echo "  Server stopped"; else echo "  Server was not running"; fi
OLLAMA=$(command -v ollama || echo /opt/homebrew/bin/ollama)
"$OLLAMA" stop gemma3:4b >/dev/null 2>&1
brew services stop ollama >/dev/null 2>&1 || pkill -x ollama
echo "  AI model stopped"
pgrep -x caffeinate >/dev/null || (nohup caffeinate -dis >/dev/null 2>&1 &)
echo "  Mac stays awake (no sleep)"
echo "Done. You can close this window."
