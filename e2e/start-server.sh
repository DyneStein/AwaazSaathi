#!/usr/bin/env bash
# Throwaway offline server for the browser tests: its own data folder, no language model, no speech recognition.
set -e
cd "$(dirname "$0")/../backend"
export AWAAZ_VAR="$(mktemp -d)" OFFLINE_MODE=true LLM_ORDER=none STT_ORDER=none
exec uv run uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8011}" --log-level warning
