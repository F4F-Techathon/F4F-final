@echo off
cd /d "%~dp0"
runtime\tools\python\python.exe scripts\manage_console.py start
if errorlevel 1 pause
