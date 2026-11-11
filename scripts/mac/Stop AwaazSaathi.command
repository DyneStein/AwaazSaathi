#!/bin/bash
# Double-click to stop the AwaazSaathi server and free the memory used by the AI model.
echo "Stopping AwaazSaathi..."
if pkill -f "uvicorn app.main:app"; then echo "  Server stopped"; else echo "  Server was not running"; fi
pkill -f "caffeinate -dis" && echo "  Mac can sleep again"
OLLAMA=$(command -v ollama || echo /opt/homebrew/bin/ollama)
"$OLLAMA" stop gemma3:4b >/dev/null 2>&1
brew services stop ollama >/dev/null 2>&1 || pkill -x ollama
echo "  AI model stopped"
echo "Done. You can close this window."
