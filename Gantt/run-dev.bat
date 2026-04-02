@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Serves index.html, CSS, JS, tasks.json and POST /save on one port (default 5500).
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "PY=python"
  goto :run
)
where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
  set "PY=py"
  goto :run
)
echo Python was not found. Install Python 3 and add it to PATH, then run this again.
pause
exit /b 1

:run
set "PORT=5500"
echo.
echo  Bland2Grand — http://localhost:%PORT%
echo  Serves the app and API (save to tasks.json). Press Ctrl+C to stop.
echo.
"%PY%" server.py
if errorlevel 1 pause
endlocal
