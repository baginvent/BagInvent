@echo off
REM Forecast Service Startup Script for Windows

setlocal enabledelayedexpansion

echo ===== BagInvent Ensemble Forecast Service =====
echo.

REM Check Python installation
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python not found. Please install Python 3.8 or later.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo [OK] Found %PYTHON_VERSION%

REM Create virtual environment if it doesn't exist
if not exist "venv" (
    echo.
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo.
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo.
echo Installing dependencies...
pip install -q --upgrade pip
pip install -q -r requirements.txt

REM Check installation
echo.
echo Verifying dependencies...
python -c "import flask; import numpy; import pandas; import statsmodels; print('[OK] All dependencies installed')" || (
    echo Error: Failed to install dependencies
    pause
    exit /b 1
)

REM Start the service
echo.
echo Starting Forecast Service...
echo Service URL: http://127.0.0.1:5000
echo Health check: http://127.0.0.1:5000/health
echo Docs: README.md
echo.

python app.py

pause
