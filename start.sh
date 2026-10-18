#!/usr/bin/env bash
# 一键运行（macOS / Linux）：只需要 Node.js 22.18+ 或 24.12+，不用 npm install。
# 手机界面 http://localhost:3000/ ，导演台 http://localhost:3000/director/ （端口可用 PORT 改）。
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js 22.18+ 或 24.12+：https://nodejs.org/" >&2
  exit 1
fi
if ! node -e "process.exit(process.features.typescript ? 0 : 1)" 2>/dev/null; then
  echo "当前 Node.js $(node -v) 太旧：需要 22.18+ 或 24.12+（能直接运行 .ts 文件）。https://nodejs.org/" >&2
  exit 1
fi
if [ ! -f dist/index.html ]; then
  echo "没找到构建好的页面（dist/）。源码请先运行：npm ci && npm run build" >&2
  exit 1
fi
if [ ! -f .env ] && [ ! -f .env.local ]; then
  cp .env.example .env
  echo "已从 .env.example 生成 .env：填入密钥后重新运行，即可启用需求整理、Jev 决策和地图（不填也能打开页面）。"
fi
exec node server/index.ts
