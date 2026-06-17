# ============================================================
#  ReelCast — One-Click Stop Script
#  หยุดทุก Service ที่รันอยู่
#  Usage: .\scripts\stop.ps1
# ============================================================

$ROOT = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "   ReelCast — Stopping All Services    " -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""

# ── 1. Stop Redis ─────────────────────────────────────────
Write-Host "[1/3] Stopping Redis (Docker)..." -ForegroundColor Yellow
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    docker compose -f "$ROOT\docker-compose.yml" down
    Write-Host "  Redis stopped." -ForegroundColor Green
} else {
    Write-Host "  Docker not running — skipping." -ForegroundColor DarkGray
}

# ── 2. Kill Backend (uvicorn on port 8000) ────────────────
Write-Host "[2/3] Stopping Backend (port 8000)..." -ForegroundColor Yellow
$pid8000 = (netstat -ano | Select-String ":8000 " | Select-String "LISTENING" | ForEach-Object { ($_ -split "\s+")[-1] } | Select-Object -First 1)
if ($pid8000) {
    Stop-Process -Id $pid8000 -Force -ErrorAction SilentlyContinue
    Write-Host "  Backend (PID $pid8000) stopped." -ForegroundColor Green
} else {
    Write-Host "  No process found on port 8000." -ForegroundColor DarkGray
}

# ── 3. Kill Frontend (Next.js on port 3000) ───────────────
Write-Host "[3/3] Stopping Frontend (port 3000)..." -ForegroundColor Yellow
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
