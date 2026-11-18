@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 (
  python tools\start-playtest.py
) else (
  py -3 tools\start-playtest.py
)
if errorlevel 1 pause
