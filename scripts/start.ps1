# ============================================================
#  ReelCast — One-Click Start Script
#  Run all services simultaneously in separate Terminal windows
#  Usage: .\scripts\start.ps1
# ============================================================

# $PSScriptRoot = .../reelcastcast/scripts  →  parent = project root
$ROOT     = Split-Path $PSScriptRoot -Parent
$BACKEND  = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ReelCast — Starting All Services    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Redis via Docker ────────────────────────────────────
Write-Host "[1/4] Starting Redis (Docker)..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Docker Desktop is not running." -ForegroundColor Red
    Write-Host "  -> Please open Docker Desktop manually, then re-run this script." -ForegroundColor Red
    Write-Host "  -> Skipping Redis startup..." -ForegroundColor DarkGray
} else {
    docker compose -f "$ROOT\docker-compose.yml" up -d
    Write-Host "  Redis started (or already running)." -ForegroundColor Green
}

# ── 2. Backend (FastAPI / uvicorn) ────────────────────────
Write-Host "[2/4] Starting Backend (FastAPI)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BACKEND'; " +
    "Write-Host '=== ReelCast: Backend (FastAPI) ===' -ForegroundColor Cyan; " +
    "& '.\venv\Scripts\Activate.ps1'; " +
    "uvicorn app.main:app --reload --port 8000"
) -WindowStyle Normal
Write-Host "  Backend window opened." -ForegroundColor Green

# Brief pause so Backend gets a head start before Celery
Start-Sleep -Seconds 2

# ── 3. Celery Worker ──────────────────────────────────────
Write-Host "[3/4] Starting Celery Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BACKEND'; " +
    "Write-Host '=== ReelCast: Celery Worker ===' -ForegroundColor Cyan; " +
    "& '.\venv\Scripts\Activate.ps1'; " +
    ".\venv\Scripts\celery -A app.worker.celery_app worker --loglevel=info --pool=solo -Q main-queue"
) -WindowStyle Normal
Write-Host "  Celery window opened." -ForegroundColor Green

# ── 4. Frontend (Next.js / bun) ───────────────────────────
Write-Host "[4/4] Starting Frontend (Next.js)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$FRONTEND'; " +
    "Write-Host '=== ReelCast: Frontend (Next.js) ===' -ForegroundColor Cyan; " +
    "bun run dev"
) -WindowStyle Normal
Write-Host "  Frontend window opened." -ForegroundColor Green

# ── Summary ───────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   All Services Launched!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend  ->  http://localhost:3000     " -ForegroundColor White
Write-Host "  Backend   ->  http://localhost:8000     " -ForegroundColor White
Write-Host "  API Docs  ->  http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Redis     ->  localhost:6379            " -ForegroundColor White
Write-Host ""
Write-Host "  To stop all services, run: .\scripts\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
