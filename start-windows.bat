@echo off
cd /d "%~dp0"
echo Number Extraction: http://localhost:8000
echo Keep this window open. Press Ctrl+C to stop.
py -3 -m http.server 8000 --bind 127.0.0.1 --directory dist
if errorlevel 1 pause
