# ============================================================
#  ReelCast — One-Click Stop Script
#  Stop all running services
#  Usage: .\scripts\stop.ps1
# ============================================================

$ROOT = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "   ReelCast — Stopping All Services    " -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# ── 1. Stop Redis ─────────────────────────────────────────
Write-Host "[1/4] Stopping Redis (Docker)..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    docker compose -f "$ROOT\docker-compose.yml" down
    Write-Host "  Redis stopped." -ForegroundColor Green
} else {
    Write-Host "  Docker not running — skipping." -ForegroundColor DarkGray
}

# ── 2. Kill Tracking Provider Adapter (uvicorn on port 9000)
Write-Host "[2/4] Stopping Tracking Provider Adapter (port 9000)..." -ForegroundColor Yellow
$pid9000 = (netstat -ano | Select-String ":9000 " | Select-String "LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pid9000) {
    Stop-Process -Id $pid9000 -Force -ErrorAction SilentlyContinue
    Write-Host "  Tracking Provider Adapter (PID $pid9000) stopped." -ForegroundColor Green
} else {
    Write-Host "  No process found on port 9000." -ForegroundColor DarkGray
}

# ── 3. Kill Backend (uvicorn on port 8000) ────────────────
Write-Host "[3/4] Stopping Backend (port 8000)..." -ForegroundColor Yellow
$pid8000 = (netstat -ano | Select-String ":8000 " | Select-String "LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pid8000) {
    Stop-Process -Id $pid8000 -Force -ErrorAction SilentlyContinue
    Write-Host "  Backend (PID $pid8000) stopped." -ForegroundColor Green
} else {
    Write-Host "  No process found on port 8000." -ForegroundColor DarkGray
}

# ── 4. Kill Frontend (Next.js on port 3000) ───────────────
Write-Host "[4/4] Stopping Frontend (port 3000)..." -ForegroundColor Yellow
$pid3000 = (netstat -ano | Select-String ":3000 " | Select-String "LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pid3000) {
    Stop-Process -Id $pid3000 -Force -ErrorAction SilentlyContinue
    Write-Host "  Frontend (PID $pid3000) stopped." -ForegroundColor Green
} else {
    Write-Host "  No process found on port 3000." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "  All ReelCast services stopped." -ForegroundColor Green
Write-Host ""
