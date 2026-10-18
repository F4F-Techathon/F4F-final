@echo off
rem CosyVoice 3 voice service on the NVIDIA GPU: http://127.0.0.1:8772  (setup: docs\windows-gpu.md in the app folder)
cd /d "%~dp0"
if not exist "runtime\cosyvoice-env\Scripts\python.exe" (
  echo CosyVoice environment missing. Run:
  echo   py -3.10 -m venv runtime\cosyvoice-env
  echo   runtime\cosyvoice-env\Scripts\python -m pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121
  echo   runtime\cosyvoice-env\Scripts\python -m pip install -r requirements-cosyvoice-win.txt
  pause
  exit /b 1
)
if not exist "runtime\CosyVoice\pretrained_models\Fun-CosyVoice3-0.5B" (
  echo CosyVoice 3 model missing. Run: .venv\Scripts\python scripts\download_cosyvoice.py
  pause
  exit /b 1
)
if not defined COSYVOICE_DEVICE set "COSYVOICE_DEVICE=cuda"
"runtime\cosyvoice-env\Scripts\python.exe" scripts\cosyvoice_service.py
pause
