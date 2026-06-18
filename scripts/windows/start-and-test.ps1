# ============================================================
#  ReelCast — Start and Test Script
#  Run all services simultaneously and then run E2E tests
#  Usage: .\scripts\start-and-test.ps1
# ============================================================

$ROOT = Split-Path $PSScriptRoot -Parent
$E2E  = Join-Path $ROOT "e2e"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ReelCast — Start & Test Pipeline     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Start all services
& "$PSScriptRoot\start.ps1"

# 2. Wait for services to be ready
Write-Host ""
Write-Host "Waiting 15 seconds for Backend and Frontend to be fully ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 3. Run E2E Tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Running Playwright E2E Tests         " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location -Path $E2E

Write-Host "Checking/Installing E2E dependencies..." -ForegroundColor DarkGray
npm install

Write-Host "Installing Playwright browsers (if needed)..." -ForegroundColor DarkGray
npx playwright install

Write-Host "Executing tests..." -ForegroundColor Yellow
npm test

# 4. Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Test Pipeline Finished!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To stop the running services, run: .\scripts\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
