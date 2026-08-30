@echo off
cd /d "%~dp0"
venv\Scripts\celery.exe -A app.worker.celery_app beat --loglevel=info
