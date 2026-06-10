@echo off
cd /d "%~dp0"
echo Starting infraFEM server on http://localhost:8000
echo CFD App: http://localhost:8000/cfd/
echo Editor:  http://localhost:8000/editor/
echo.
uvicorn server.app:app --reload --port 8000
pause
