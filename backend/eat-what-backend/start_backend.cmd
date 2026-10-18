@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Create .venv and install requirements-handoff.txt first.
  exit /b 1
)
".venv\Scripts\python.exe" scripts\run_backend.py %*
