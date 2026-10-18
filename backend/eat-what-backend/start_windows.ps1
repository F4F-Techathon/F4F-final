$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$projectPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $projectPython)) {
  throw "请先运行 python -m venv .venv，然后运行 .\.venv\Scripts\python.exe -m pip install -r requirements.txt"
}

if (-not (Test-Path ".env.local")) {
  Write-Host "提示：复制 .env.example 为 .env.local 后可启用 LiveKit、DeepSeek 和 CosyVoice。"
}

Write-Host "启动 Web/API：http://127.0.0.1:8770"
& $projectPython -m uvicorn server.app:app --host 127.0.0.1 --port 8770

