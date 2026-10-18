@echo off
rem Multi-agent backend for the app, on Windows: http://127.0.0.1:8771  (setup: docs\windows-gpu.md in the app folder)
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python 3.11 environment missing. Run:
  echo   py -3.11 -m venv .venv
  echo   .venv\Scripts\python -m pip install -r requirements-handoff.txt
  pause
  exit /b 1
)
rem The 66 shops the app shows; falls back to the delivered data\latest when absent.
if not defined CONSOLE_DATA_DIR if exist "data\full" set "CONSOLE_DATA_DIR=data/full"
rem Keys live only in the app's .env.local / .env and are read in place, never copied here.
if not defined EAT_WHAT_ENV_FILES (
  if exist "..\..\package.json" (set "EAT_WHAT_ENV_FILES=..\..\.env.local;..\..\.env") else (set "EAT_WHAT_ENV_FILES=..\..\Frontend\.env.local;..\..\Frontend\.env")
)
rem faster-whisper on CUDA loads cuBLAS / cuDNN from the pip wheels nvidia-cublas-cu12 and nvidia-cudnn-cu12.
if exist ".venv\Lib\site-packages\nvidia\cublas\bin" set "PATH=%CD%\.venv\Lib\site-packages\nvidia\cublas\bin;%PATH%"
if exist ".venv\Lib\site-packages\nvidia\cudnn\bin" set "PATH=%CD%\.venv\Lib\site-packages\nvidia\cudnn\bin;%PATH%"
if not exist ".env.local" if exist "env.windows-gpu.example" (
  copy "env.windows-gpu.example" ".env.local" >nul
  echo Created .env.local from env.windows-gpu.example: CosyVoice 3 and Whisper on the GPU.
)
".venv\Scripts\python.exe" scripts\run_backend.py %*
pause
