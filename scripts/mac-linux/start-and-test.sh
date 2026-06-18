#!/bin/bash
# ============================================================
#  ReelCast — Start and Test Script
#  Usage: ./scripts/mac-linux/start-and-test.sh
# ============================================================

set -e

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
E2E_DIR="$ROOT_DIR/e2e"

echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36m   ReelCast — Start & Test Pipeline     \033[0m"
echo -e "\033[0;36m========================================\033[0m"
echo ""

# 1. Install/update testing dependencies
echo -e "\033[0;33mInstalling/updating E2E testing dependencies...\033[0m"
if ! command -v npm > /dev/null 2>&1; then
    echo -e "\033[0;31m  ERROR: npm is not installed or is not available on PATH.\033[0m"
    exit 1
fi

cd "$E2E_DIR"

echo -e "\033[1;30mChecking/Installing E2E dependencies...\033[0m"
npm install

echo -e "\033[1;30mInstalling Playwright browsers (if needed)...\033[0m"
npx playwright install

# 2. Start all services
bash "$ROOT_DIR/scripts/mac-linux/start.sh"

# 3. Wait for services to be ready
echo ""
echo -e "\033[0;33mWaiting 15 seconds for Backend and Frontend to be fully ready...\033[0m"
sleep 15

# 4. Run E2E Tests
echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36m   Running Playwright E2E Tests         \033[0m"
echo -e "\033[0;36m========================================\033[0m"

cd "$E2E_DIR"

echo -e "\033[0;33mExecuting tests...\033[0m"
npm test

# 5. Summary
echo ""
echo -e "\033[0;32m========================================\033[0m"
echo -e "\033[0;32m   Test Pipeline Finished!              \033[0m"
echo -e "\033[0;32m========================================\033[0m"
echo ""
echo -e "\033[1;30mTo stop the running services, run: ./scripts/mac-linux/stop.sh\033[0m"
echo ""
