#!/usr/bin/env bash
# One-command start: builds the front end (if needed), starts the server on all interfaces, prints LAN URLs + QR.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
[ -f .env ] || { cp .env.example .env; echo "Created .env from .env.example - add your keys"; }
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi
if [ ! -f backend/static/index.html ] || [ -n "$(find frontend/src -newer backend/static/index.html -print -quit)" ]; then
  echo "Building front end..."; (cd frontend && npm run build >/dev/null)
fi
# Keep the local language model warm so the first answer is fast
(command -v ollama >/dev/null && (pgrep -x ollama >/dev/null || (brew services start ollama >/dev/null 2>&1 || (nohup ollama serve >/tmp/ollama.log 2>&1 &))) && sleep 2 && curl -s localhost:11434/api/generate -d '{"model":"gemma3:4b","keep_alive":"60m"}' >/dev/null) || true
cd backend && uv sync -q
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
pkill -f "uvicorn app.main:app" 2>/dev/null || true
echo ""
echo "  AwaazSaathi is starting on port 8000"
echo "  ----------------------------------------------"
echo "  This laptop:  http://localhost:8000          (home)"
echo "  Presenter:    http://localhost:8000/admin"
echo "  Expert:       http://localhost:8000/expert"
echo "  Farmer:       http://$IP:8000/farmer"
echo "  Dealer phone: http://$IP:8000/dealer"
echo ""
uv run python -c "import qrcode; q=qrcode.QRCode(border=1); q.add_data('http://$IP:8000/dealer'); q.print_ascii(invert=True)" 2>/dev/null || true
echo "  (scan with the dealer's Android phone - same hotspot)"
echo ""
(for i in $(seq 1 40); do curl -s localhost:8000/api/health >/dev/null && break; sleep 1; done; open "http://localhost:8000/connect" "http://localhost:8000/farmer" "http://localhost:8000/expert" "http://localhost:8000/admin") &
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
