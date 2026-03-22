@echo off
cd /d "%~dp0"
echo Starting Voice Tech (Next.js)...
start "" "http://localhost:3000"
npm run dev
