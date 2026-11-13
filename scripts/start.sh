#!/usr/bin/env bash
# One-command start: builds the front end (if needed), starts the server on all interfaces, prints LAN URLs + QR.
# The internet link (phones on any network) starts automatically with the server, so it is ready before the demo.
# ./scripts/start.sh --local   starts without it (same Wi-Fi or phone hotspot only).
set -e
ONLINE=1; [ "$1" = "--local" ] && ONLINE=0
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
echo "  Phones (QR codes):  http://localhost:8000/connect"
echo "  Operations map:     http://localhost:8000/admin"
echo "  Farmer stage:       http://localhost:8000/farmer"
echo "  Agronomist:         http://localhost:8000/expert"
echo "  Same Wi-Fi link:    http://$IP:8000   (teammates: AwaazSaathi-Open.bat)"
echo ""
uv run python -c "import qrcode; q=qrcode.QRCode(border=1); q.add_data('http://$IP:8000/connect'); q.print_ascii(invert=True)" 2>/dev/null || true
echo "  Scan to open the Connect page on a phone (same Wi-Fi)."
[ "$ONLINE" = 1 ] && { echo "  Internet link: starting by itself in the background (Connect page shows it; --local to skip)."; export AWAAZ_ONLINE=1; }
echo ""
(for i in $(seq 1 40); do curl -s localhost:8000/api/health >/dev/null && break; sleep 1; done
 [ "$ONLINE" = 1 ] && echo "  The internet link is being set up in the background: see the Connect page."
 open "http://localhost:8000/connect" "http://localhost:8000/admin" "http://localhost:8000/farmer" "http://localhost:8000/expert") &
# Keep the Mac awake (screen may dim) for as long as the server runs: a sleeping Mac drops every phone and the internet link.
command -v caffeinate >/dev/null && (caffeinate -ims -w $$ &)
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
