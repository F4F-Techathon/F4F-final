@echo off
cd /d "%~dp0"
"runtime\tools\python\python.exe" "scripts\manage_voice.py" stop
pause
