@echo off
cd /d "%~dp0"
"runtime\tools\python\python.exe" "scripts\manage_voice.py" start
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8770"
pause
