@echo off
rem CosyVoice 3 on the NVIDIA GPU (:8772), reusing this PC's existing install instead of runtime\cosyvoice-env:
rem   code + weights: D:\projects\techthon\tts\CosyVoice   Python 3.10 env: conda "cosyvoice" (torch 2.3.1+cu121)
cd /d "%~dp0"
if not defined COSYVOICE_PYTHON set "COSYVOICE_PYTHON=%USERPROFILE%\anaconda3\envs\cosyvoice\python.exe"
if not defined COSYVOICE_DIR set "COSYVOICE_DIR=D:\projects\techthon\tts\CosyVoice"
if not defined COSYVOICE_MODEL_DIR set "COSYVOICE_MODEL_DIR=%COSYVOICE_DIR%\pretrained_models\Fun-CosyVoice3-0.5B"
rem The wetext frontend that install already downloaded.
if not defined MODELSCOPE_CACHE set "MODELSCOPE_CACHE=%USERPROFILE%\.cache\modelscope"
if not defined COSYVOICE_DEVICE set "COSYVOICE_DEVICE=cuda"
"%COSYVOICE_PYTHON%" scripts\cosyvoice_service.py
pause
