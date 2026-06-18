# ============================================================
#  ReelCast — Start and Test Script
#  Run all services simultaneously and then run E2E tests
#  Usage: .\scripts\windows\start-and-test.ps1
# ============================================================

$ROOT = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$E2E  = Join-Path $ROOT "e2e"
$BACKEND = Join-Path $ROOT "backend"
$VENV_PY = Join-Path $BACKEND "venv\Scripts\python.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ReelCast — Start & Test Pipeline     " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Install/update testing dependencies
Write-Host "Installing/updating E2E testing dependencies..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: npm is not installed or is not available on PATH." -ForegroundColor Red
    exit 1
}

Push-Location -Path $E2E

Write-Host "Checking/Installing E2E dependencies..." -ForegroundColor DarkGray
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Installing Playwright browsers (if needed)..." -ForegroundColor DarkGray
npx playwright install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Pop-Location

# 2. Start all services
& "$PSScriptRoot\start.ps1"

# 3. Wait for services to be ready
Write-Host ""
Write-Host "Waiting 15 seconds for Backend and Frontend to be fully ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 4. Run Backend Unit Tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Running Backend Unit Tests           " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Push-Location -Path $BACKEND

Write-Host "Executing backend_unit_test.py..." -ForegroundColor Yellow
& $VENV_PY -m unittest tests.backend_unit_test
if ($LASTEXITCODE -ne 0) { 
    Write-Host "  ERROR: Backend Unit Tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE 
}

Pop-Location

# 5. Run E2E Tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Running Playwright E2E Tests         " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location -Path $E2E

Write-Host "Executing tests..." -ForegroundColor Yellow
npm test

# 6. Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Test Pipeline Finished!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To stop the running services, run: .\scripts\windows\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
