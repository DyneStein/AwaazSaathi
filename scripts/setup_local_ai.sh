#!/usr/bin/env bash
# One-time setup: on-device AI for the demo (no API keys). Needs internet once (~4 GB download).
cd "$(dirname "$0")/.."
echo "1/5  Python and front-end dependencies"
(cd backend && uv sync -q) && (cd frontend && npm install --silent && npm run build >/dev/null) || { echo "Dependency install failed - check internet"; exit 1; }

echo "2/5  Speech-to-text engine (whisper.cpp) and ffmpeg"
command -v whisper-cli >/dev/null || brew install whisper-cpp
command -v ffmpeg >/dev/null || brew install ffmpeg

echo "3/5  Whisper large-v3-turbo model (~550 MB)"
mkdir -p backend/models
M=backend/models/ggml-large-v3-turbo-q5_0.bin
F=ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
if [ ! -s "$M" ]; then
  for TRY in "https://huggingface.co" "https://hf-mirror.com" "doh https://huggingface.co"; do
    set -- $TRY; EXTRA=""
    if [ "$1" = "doh" ]; then EXTRA="--doh-url https://1.1.1.1/dns-query"; HOST=$2; echo "     trying $HOST (DNS over HTTPS, bypasses broken DNS) ..."; else HOST=$1; echo "     trying $HOST ..."; fi
    curl -L --fail --progress-bar --connect-timeout 15 --retry 3 -C - $EXTRA -o "$M.part" "$HOST/$F" && mv "$M.part" "$M" && break
  done
fi
if [ -s "$M" ]; then echo "     speech model ready"; else
  echo "     !! Could not download the speech model (DNS/ISP block). Fix: set DNS to 1.1.1.1 and 8.8.8.8, then re-run this script."
  echo "     The demo still works: typed questions and sample chips, or a GROQ_API_KEY in .env for cloud speech."
fi

echo "4/5  Ollama + gemma3:4b language/vision model (~3.3 GB)"
if ! command -v ollama >/dev/null && [ -x /Applications/Ollama.app/Contents/Resources/ollama ]; then export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"; fi
command -v ollama >/dev/null || brew install ollama || echo "     !! brew could not install Ollama. Download the app from https://ollama.com/download, open it once, then re-run."
pgrep -x ollama >/dev/null || (brew services start ollama >/dev/null 2>&1 || (nohup ollama serve >/tmp/ollama.log 2>&1 &))
for i in $(seq 1 20); do curl -s localhost:11434/api/tags >/dev/null && break; sleep 1; done
ollama pull gemma3:4b || echo "     !! Could not pull gemma3:4b - check internet/DNS and re-run. The demo still works without it (rules + knowledge base)."

echo "5/5  Pre-generating the Urdu voice and caching the demo answers (works offline afterwards)"
(cd backend && uv run python ../scripts/warm_cache.py)
echo ""
echo "Done. Start the demo with:  ./scripts/start.sh"
