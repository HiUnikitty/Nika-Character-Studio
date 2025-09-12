@echo off
chcp 65001 >nul
echo Starting Nika Character Studio Server...
echo.

REM Switch to project directory
cd /d "%~dp0"

REM Start Python HTTP server on port 9999
echo Starting server on port: 9999
echo Server address: http://localhost:9999
echo.
echo Press Ctrl+C to stop server
echo.

REM Delay 2 seconds then auto open browser
timeout /t 2 /nobreak >nul && start "" "http://localhost:9999"

REM Start Python server
python -m http.server 9999

REM If Python command fails, try python3
if errorlevel 1 (
    echo Python command failed, trying python3...
    python3 -m http.server 9999
)

REM If both failed, show error message
if errorlevel 1 (
    echo.
    echo Error: Python not found. Please ensure Python is installed and added to PATH.
    echo.
    pause
)
