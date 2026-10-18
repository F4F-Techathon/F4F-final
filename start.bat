@echo off
rem One-click run on Windows: needs Node.js 22.18+ or 24.12+, no npm install.
rem Phone app: http://localhost:3000/   Test console: http://localhost:3000/director/   (PORT changes the port)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.18+ or 24.12+ is required: https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(process.features.typescript ? 0 : 1)" >nul 2>nul
if errorlevel 1 (
  echo This Node.js is too old: 22.18+ or 24.12+ is required, it runs .ts files directly. https://nodejs.org/
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo The built pages in dist\ are missing. From source, run: npm ci, then npm run build
  pause
  exit /b 1
)
if not exist ".env" if not exist ".env.local" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example. Fill in the keys and run again to enable intake, Jev and the map.
)
rem Node 24.12 has no http.setGlobalProxyFromEnv, so fetch only honours HTTPS_PROXY with this switch (TypeSafe answers 451 from CN).
if not defined NODE_USE_ENV_PROXY set "NODE_USE_ENV_PROXY=1"
node server/index.ts
pause
