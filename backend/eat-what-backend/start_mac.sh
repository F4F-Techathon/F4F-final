#!/usr/bin/env bash
# macOS (Apple Silicon) launcher for the multi-agent backend behind the 饭店请就位 frontend.
#   ./start_mac.sh            WebSocket API on 127.0.0.1:8771 (/api/realtime), debug console /console.html
#   ./start_mac.sh --check    load everything and report readiness, without serving
# Settings: .env.local (TTS_PROVIDER=macos, WHISPER_BACKEND=transformers on the Apple GPU, keys read in place
# from the frontend's env files). data/full holds all 66 shops the frontend shows; the delivered tests keep
# using the 7-shop data/latest snapshot.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Create the environment first: uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements-handoff.txt torch transformers" >&2
  exit 1
fi
export CONSOLE_DATA_DIR="${CONSOLE_DATA_DIR:-data/full}"
[ -d "$CONSOLE_DATA_DIR" ] || export CONSOLE_DATA_DIR=data/latest
exec .venv/bin/python scripts/run_backend.py "$@"
