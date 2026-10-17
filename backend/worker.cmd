@echo off
cd /d "%~dp0"
rem Run once per queue: worker.cmd generation / publish / sync / scheduler / caption
set "REELCAST_WORKER_KIND=%~1"
if "%REELCAST_WORKER_KIND%"=="" set "REELCAST_WORKER_KIND=generation"
set "REELCAST_WORKER_QUEUES=%REELCAST_WORKER_KIND%-queue"
if "%REELCAST_WORKER_KIND%"=="generation" set "REELCAST_WORKER_QUEUES=generation-queue,main-queue"
set "REELCAST_WORKER_POOL=--pool=solo"
if "%REELCAST_WORKER_KIND%"=="sync" set "REELCAST_WORKER_POOL=--pool=threads --concurrency=4"
venv\Scripts\celery.exe -A app.worker.celery_app worker --loglevel=info %REELCAST_WORKER_POOL% --hostname=%REELCAST_WORKER_KIND%@%%h -Q %REELCAST_WORKER_QUEUES%
