#!/usr/bin/env bash
# One-time setup: on-device AI for the demo (no API keys). Needs internet once (~4 GB download).
set -e
cd "$(dirname "$0")/.."
echo "1/5  Python and front-end dependencies"
(cd backend && uv sync -q) && (cd frontend && npm install --silent && npm run build >/dev/null)

echo "2/5  Speech-to-text engine (whisper.cpp) and ffmpeg"
command -v whisper-cli >/dev/null || brew install whisper-cpp
command -v ffmpeg >/dev/null || brew install ffmpeg

echo "3/5  Whisper large-v3-turbo model (~550 MB)"
mkdir -p backend/models
M=backend/models/ggml-large-v3-turbo-q5_0.bin
[ -s "$M" ] || curl -L --fail --progress-bar -o "$M" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin

echo "4/5  Ollama + gemma3:4b language/vision model (~3.3 GB)"
command -v ollama >/dev/null || brew install ollama
pgrep -x ollama >/dev/null || (brew services start ollama >/dev/null 2>&1 || (nohup ollama serve >/tmp/ollama.log 2>&1 &))
for i in $(seq 1 20); do curl -s localhost:11434/api/tags >/dev/null && break; sleep 1; done
ollama pull gemma3:4b

echo "5/5  Pre-generating the Urdu voice and caching the demo answers (works offline afterwards)"
(cd backend && uv run python ../scripts/warm_cache.py)
echo ""
echo "Done. Start the demo with:  ./scripts/start.sh"
