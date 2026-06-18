#!/bin/bash
# ============================================================
#  ReelCast — One-Click Stop Script
#  Usage: ./scripts/mac-linux/stop.sh
# ============================================================

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT_DIR="$ROOT_DIR/scripts/mac-linux"

echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36m   ReelCast — Stopping All Services    \033[0m"
echo -e "\033[0;36m========================================\033[0m"
echo ""

# ── 1. Stop Frontend ──────────────────────────────────────
if [ -f "$SCRIPT_DIR/.frontend_pid" ]; then
    PID=$(cat "$SCRIPT_DIR/.frontend_pid")
    echo "Stopping Frontend (PID: $PID)..."
    kill $PID 2>/dev/null
    rm "$SCRIPT_DIR/.frontend_pid"
else
    echo "Frontend PID not found. Searching for 'bun' processes..."
    pkill -f "bun run dev" 2>/dev/null
fi

# ── 2. Stop Celery Worker ─────────────────────────────────
if [ -f "$SCRIPT_DIR/.celery_pid" ]; then
    PID=$(cat "$SCRIPT_DIR/.celery_pid")
    echo "Stopping Celery Worker (PID: $PID)..."
    kill $PID 2>/dev/null
    rm "$SCRIPT_DIR/.celery_pid"
else
    echo "Celery PID not found. Searching for 'celery' processes..."
    pkill -f "celery -A app.worker.celery_app worker" 2>/dev/null
fi

# ── 3. Stop Backend ───────────────────────────────────────
if [ -f "$SCRIPT_DIR/.backend_pid" ]; then
    PID=$(cat "$SCRIPT_DIR/.backend_pid")
    echo "Stopping Backend (PID: $PID)..."
    kill $PID 2>/dev/null
    rm "$SCRIPT_DIR/.backend_pid"
else
    echo "Backend PID not found. Searching for 'uvicorn' processes..."
    pkill -f "uvicorn app.main:app" 2>/dev/null
fi

echo -e "\033[0;32m  All services stopped.\033[0m"
echo ""
