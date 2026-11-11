#!/usr/bin/env bash
# Reset demo data (server may be running or not).
cd "$(dirname "$0")/../backend"
if curl -s -X POST localhost:8000/api/admin/reset >/dev/null 2>&1; then echo "Reset via running server."; else uv run python -m app.seed && echo "Database reseeded."; fi
