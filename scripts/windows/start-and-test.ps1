# ============================================================
#  ReelCast — Start and Test Script
#  Run all services simultaneously and then run E2E tests
#  Usage: .\scripts\windows\start-and-test.ps1
# ============================================================

$ROOT = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$E2E  = Join-Path $ROOT "e2e"
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"
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

# 2. Start all services in deterministic test mode.
$env:REELCAST_TEST_MODE = "true"
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

Write-Host "Executing backend unit suite..." -ForegroundColor Yellow
& $VENV_PY tests\run_unit_tests.py
if ($LASTEXITCODE -ne 0) { 
    Write-Host "  ERROR: Backend Unit Tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE 
}

Pop-Location

# 5. Run Frontend Unit Tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Running Frontend Unit Tests          " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Push-Location -Path $FRONTEND
bun run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Frontend Unit Tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}
Pop-Location

# 6. Run UI Unit E2E and System E2E Tests
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Running Playwright Test Suites       " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Set-Location -Path $E2E

Write-Host "Executing UI unit E2E tests..." -ForegroundColor Yellow
npm run test:ui-unit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Executing System E2E tests..." -ForegroundColor Yellow
npm run test:system
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 7. Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Test Pipeline Finished!              " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To stop the running services, run: .\scripts\windows\stop.ps1" -ForegroundColor DarkGray
Write-Host ""
