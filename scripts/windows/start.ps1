# ============================================================
#  ReelCast — One-Click Start Script
#  Run all services simultaneously in separate Terminal windows
#  Usage: .\scripts\windows\start.ps1
# ============================================================

# $PSScriptRoot = .../reelcastcast/scripts/windows  ->  parent of scripts = project root
$ROOT     = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$BACKEND  = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"
$VENV_PY  = Join-Path $BACKEND "venv\Scripts\python.exe"
$VENV_ACTIVATE = Join-Path $BACKEND "venv\Scripts\Activate.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ReelCast — Starting All Services    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Backend Dependencies ────────────────────────────────
Write-Host "[1/7] Installing/updating Backend dependencies..." -ForegroundColor Yellow
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Python is not installed or is not available on PATH." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $VENV_PY)) {
    Write-Host "  Creating backend virtual environment..." -ForegroundColor DarkGray
    Push-Location $BACKEND
    python -m venv venv
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Pop-Location
}

& $VENV_PY -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $VENV_PY -m pip install --upgrade -r (Join-Path $BACKEND "requirements.txt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "  Backend dependencies are ready." -ForegroundColor Green

# ── 2. Frontend Dependencies ───────────────────────────────
Write-Host "[2/7] Installing/updating Frontend dependencies..." -ForegroundColor Yellow
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Bun is not installed or is not available on PATH." -ForegroundColor Red
    exit 1
}

Push-Location $FRONTEND
bun install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Pop-Location
Write-Host "  Frontend dependencies are ready." -ForegroundColor Green

# ── 3. Redis via Docker ────────────────────────────────────
Write-Host "[3/7] Starting Redis (Docker)..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Docker Desktop is not running." -ForegroundColor Red
    Write-Host "  -> Please open Docker Desktop manually, then re-run this script." -ForegroundColor Red
    Write-Host "  -> Skipping Redis startup..." -ForegroundColor DarkGray
} else {
    docker compose -f "$ROOT\docker-compose.yml" up -d
    Write-Host "  Redis started (or already running)." -ForegroundColor Green
}

# ── 4. Backend (FastAPI / uvicorn) ────────────────────────
Write-Host "[4/7] Starting Backend (FastAPI)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BACKEND'; " +
    "Write-Host '=== ReelCast: Backend (FastAPI) ===' -ForegroundColor Cyan; " +
    "& '$VENV_ACTIVATE'; " +
    "uvicorn app.main:app --reload --port 8000"
) -WindowStyle Normal
Write-Host "  Backend window opened." -ForegroundColor Green

# Brief pause so Backend gets a head start before Celery
Start-Sleep -Seconds 2

# ── 5. Celery Worker ──────────────────────────────────────
Write-Host "[5/7] Starting Celery Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BACKEND'; " +
    "Write-Host '=== ReelCast: Celery Worker ===' -ForegroundColor Cyan; " +
    "& '$VENV_ACTIVATE'; " +
    ".\venv\Scripts\celery -A app.worker.celery_app worker --loglevel=info --pool=solo -Q main-queue"
) -WindowStyle Normal
Write-Host "  Celery window opened." -ForegroundColor Green

# ── 6. Celery Beat (F3 scheduled distribution) ────────────
Write-Host "[6/7] Starting Celery Beat..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd '$BACKEND'; " +
    "Write-Host '=== ReelCast: Celery Beat ===' -ForegroundColor Cyan; " +
    "& '$VENV_ACTIVATE'; " +
    ".\venv\Scripts\celery -A app.worker.celery_app beat --loglevel=info"
) -WindowStyle Normal
Write-Host "  Celery Beat window opened." -ForegroundColor Green

# ── 7. Frontend (Next.js / bun) ───────────────────────────
Write-Host "[7/7] Starting Frontend (Next.js)..." -ForegroundColor Yellow
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
Write-Host "  To stop all services, run: .\scripts\windows\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
