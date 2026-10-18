@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run python -m venv .venv first, then install requirements.txt.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8770"
".venv\Scripts\python.exe" -m uvicorn server.app:app --host 127.0.0.1 --port 8770
pause
