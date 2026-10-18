@echo off
rem Everything on Windows, each in its own window: the multi-agent backend (:8771) and the app (:3000).
rem Voices come from Alibaba Cloud Model Studio's realtime Qwen3-TTS (DASHSCOPE_API_KEY in .env.local); the local
rem CosyVoice 3 service is no longer started (start_cosyvoice_existing.cmd in the backend folder still runs it).
rem Set up once first: docs\windows-gpu.md
cd /d "%~dp0"
set "BACKEND=%~dp0backend\eat-what-backend"
if not exist "%BACKEND%\scripts\run_backend.py" set "BACKEND=%~dp0..\Backend\eat-what-backend"
if not exist "%BACKEND%\scripts\run_backend.py" (
  echo The backend folder is missing: expected backend\eat-what-backend next to this file.
  pause
  exit /b 1
)
start "Multi-agent backend :8771" /d "%BACKEND%" cmd /k "%BACKEND%\start_api_windows.cmd"
start "App :3000" /d "%~dp0." cmd /k "%~dp0start.bat"
echo Phone app: http://localhost:3000/    Console: http://localhost:3000/director/
echo Whisper loads on the first press of the mic.
