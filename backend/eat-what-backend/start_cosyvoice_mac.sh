#!/usr/bin/env bash
# CosyVoice 3 on Apple Silicon (MPS), reusing an existing local install instead of a second download:
# the uv environment ~/.venvs/cosyvoice311 (Python 3.11, torch 2.3.1) and the weights in
# ~/tts/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B (same files as config/cosyvoice-model-manifest.json).
# Measured on an M1 Pro: about 7x slower than real time, so it suits pre-rendered audio, not a live debate.
# To use it live anyway, set TTS_PROVIDER=cosyvoice-http in .env.local and start this first.
set -euo pipefail
cd "$(dirname "$0")"
PY="${COSYVOICE_PYTHON:-$HOME/.venvs/cosyvoice311/bin/python}"
export COSYVOICE_DEVICE="${COSYVOICE_DEVICE:-mps}"
export COSYVOICE_MODEL_DIR="${COSYVOICE_MODEL_DIR:-$HOME/tts/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B}"
export MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-$HOME/.cache/modelscope}"
exec "$PY" scripts/cosyvoice_service.py
