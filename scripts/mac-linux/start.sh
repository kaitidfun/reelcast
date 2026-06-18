#!/bin/bash
# ============================================================
#  ReelCast — One-Click Start Script
#  Run all services simultaneously in background
#  Usage: ./scripts/mac-linux/start.sh
# ============================================================

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36m   ReelCast — Starting All Services    \033[0m"
echo -e "\033[0;36m========================================\033[0m"
echo ""

# ── 1. Redis via Docker ────────────────────────────────────
echo -e "\033[0;33m[1/4] Starting Redis (Docker)...\033[0m"
if ! docker info > /dev/null 2>&1; then
    echo -e "\033[0;31m  WARNING: Docker Desktop is not running.\033[0m"
    echo -e "\033[0;31m  -> Please open Docker manually, then re-run this script.\033[0m"
    echo -e "\033[1;30m  -> Skipping Redis startup...\033[0m"
else
    docker-compose -f "$ROOT_DIR/docker-compose.yml" up -d
    echo -e "\033[0;32m  Redis started (or already running).\033[0m"
fi

# ── 2. Backend (FastAPI / uvicorn) ────────────────────────
echo -e "\033[0;33m[2/4] Starting Backend (FastAPI)...\033[0m"
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
echo -e "\033[0;32m  Backend started in background (PID: $BACKEND_PID).\033[0m"

sleep 2

# ── 3. Celery Worker ──────────────────────────────────────
echo -e "\033[0;33m[3/4] Starting Celery Worker...\033[0m"
venv/bin/celery -A app.worker.celery_app worker --loglevel=info -Q main-queue > celery.log 2>&1 &
CELERY_PID=$!
echo -e "\033[0;32m  Celery Worker started in background (PID: $CELERY_PID).\033[0m"

# ── 4. Frontend (Next.js / bun) ───────────────────────────
echo -e "\033[0;33m[4/4] Starting Frontend (Next.js)...\033[0m"
cd "$FRONTEND_DIR"
bun run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "\033[0;32m  Frontend started in background (PID: $FRONTEND_PID).\033[0m"

# ── Save PIDs for stop script ─────────────────────────────
echo "$BACKEND_PID" > "$ROOT_DIR/scripts/mac-linux/.backend_pid"
echo "$CELERY_PID" > "$ROOT_DIR/scripts/mac-linux/.celery_pid"
echo "$FRONTEND_PID" > "$ROOT_DIR/scripts/mac-linux/.frontend_pid"

# ── Summary ───────────────────────────────────────────────
echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;32m   All Services Launched in Background!\033[0m"
echo -e "\033[0;36m========================================\033[0m"
echo ""
echo -e "  Frontend  ->  \033[1;37mhttp://localhost:3000\033[0m"
echo -e "  Backend   ->  \033[1;37mhttp://localhost:8000\033[0m"
echo -e "  API Docs  ->  \033[1;37mhttp://localhost:8000/docs\033[0m"
echo -e "  Redis     ->  \033[1;37mlocalhost:6379\033[0m"
echo ""
echo -e "Logs are being written to:"
echo -e "  - backend/backend.log"
echo -e "  - backend/celery.log"
echo -e "  - frontend/frontend.log"
echo ""
echo -e "\033[1;30m  To stop all services, run: ./scripts/mac-linux/stop.sh\033[0m"
echo ""
