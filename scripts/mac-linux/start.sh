#!/bin/bash
# ============================================================
#  ReelCast — One-Click Start Script
#  Run all services simultaneously in background
#  Usage: ./scripts/mac-linux/start.sh
# ============================================================

set -e

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ADAPTER_DIR="$ROOT_DIR/tracking-provider-adapter"
VENV_PY="$BACKEND_DIR/venv/bin/python"
ADAPTER_VENV_PY="$ADAPTER_DIR/.venv/bin/python"

echo ""
echo -e "\033[0;36m========================================\033[0m"
echo -e "\033[0;36m   ReelCast — Starting All Services    \033[0m"
echo -e "\033[0;36m========================================\033[0m"
echo ""

# ── 1. Backend Dependencies ────────────────────────────────
echo -e "\033[0;33m[1/8] Installing/updating Backend dependencies...\033[0m"
if ! command -v python3 > /dev/null 2>&1 && ! command -v python > /dev/null 2>&1; then
    echo -e "\033[0;31m  ERROR: Python is not installed or is not available on PATH.\033[0m"
    exit 1
fi

if [ ! -x "$VENV_PY" ]; then
    echo -e "\033[1;30m  Creating backend virtual environment...\033[0m"
    if command -v python3 > /dev/null 2>&1; then
        python3 -m venv "$BACKEND_DIR/venv"
    else
        python -m venv "$BACKEND_DIR/venv"
    fi
fi

"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install --upgrade -r "$BACKEND_DIR/requirements.txt"
echo -e "\033[0;32m  Backend dependencies are ready.\033[0m"

# ── 2. Frontend Dependencies ───────────────────────────────
echo -e "\033[0;33m[2/8] Installing/updating Frontend dependencies...\033[0m"
if ! command -v bun > /dev/null 2>&1; then
    echo -e "\033[0;31m  ERROR: Bun is not installed or is not available on PATH.\033[0m"
    exit 1
fi

cd "$FRONTEND_DIR"
bun install
echo -e "\033[0;32m  Frontend dependencies are ready.\033[0m"

# ── 3. Redis via Docker ────────────────────────────────────
echo -e "\033[0;33m[3/8] Starting Redis (Docker)...\033[0m"
if ! docker info > /dev/null 2>&1; then
    echo -e "\033[0;31m  WARNING: Docker Desktop is not running.\033[0m"
    echo -e "\033[0;31m  -> Please open Docker manually, then re-run this script.\033[0m"
    echo -e "\033[1;30m  -> Skipping Redis startup...\033[0m"
else
    docker-compose -f "$ROOT_DIR/docker-compose.yml" up -d
    echo -e "\033[0;32m  Redis started (or already running).\033[0m"
fi

# ── 4. Tracking Provider Adapter (FastAPI / uvicorn) ──────
echo -e "\033[0;33m[4/8] Installing/updating Tracking Provider Adapter dependencies...\033[0m"
if [ ! -x "$ADAPTER_VENV_PY" ]; then
    echo -e "\033[1;30m  Creating adapter virtual environment...\033[0m"
    if command -v python3 > /dev/null 2>&1; then
        python3 -m venv "$ADAPTER_DIR/.venv"
    else
        python -m venv "$ADAPTER_DIR/.venv"
    fi
fi
"$ADAPTER_VENV_PY" -m pip install --upgrade pip
"$ADAPTER_VENV_PY" -m pip install --upgrade -r "$ADAPTER_DIR/requirements.txt"
echo -e "\033[0;32m  Adapter dependencies are ready.\033[0m"

echo -e "\033[0;33m[5/8] Starting Tracking Provider Adapter (FastAPI)...\033[0m"
cd "$ADAPTER_DIR"
"$ADAPTER_VENV_PY" -m uvicorn app.main:app --reload --port 9000 > adapter.log 2>&1 &
ADAPTER_PID=$!
echo -e "\033[0;32m  Tracking Provider Adapter started in background (PID: $ADAPTER_PID).\033[0m"

# ── 5. Backend (FastAPI / uvicorn) ────────────────────────
echo -e "\033[0;33m[6/8] Starting Backend (FastAPI)...\033[0m"
cd "$BACKEND_DIR"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 > backend.log 2>&1 &
BACKEND_PID=$!
echo -e "\033[0;32m  Backend started in background (PID: $BACKEND_PID).\033[0m"

sleep 2

# ── 6. Celery Worker ──────────────────────────────────────
echo -e "\033[0;33m[7/8] Starting Celery Worker...\033[0m"
venv/bin/celery -A app.worker.celery_app worker --loglevel=info -Q main-queue > celery.log 2>&1 &
CELERY_PID=$!
echo -e "\033[0;32m  Celery Worker started in background (PID: $CELERY_PID).\033[0m"

# ── 7. Celery Beat (F3 scheduled distribution) ────────────
echo -e "\033[0;33m[8/8] Starting Celery Beat...\033[0m"
venv/bin/celery -A app.worker.celery_app beat --loglevel=info > celery-beat.log 2>&1 &
CELERY_BEAT_PID=$!
echo -e "\033[0;32m  Celery Beat started in background (PID: $CELERY_BEAT_PID).\033[0m"

# ── 8. Frontend (Next.js / bun) ───────────────────────────
echo -e "\033[0;33mStarting Frontend (Next.js)...\033[0m"
cd "$FRONTEND_DIR"
bun run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "\033[0;32m  Frontend started in background (PID: $FRONTEND_PID).\033[0m"

# ── Save PIDs for stop script ─────────────────────────────
echo "$BACKEND_PID" > "$ROOT_DIR/scripts/mac-linux/.backend_pid"
echo "$ADAPTER_PID" > "$ROOT_DIR/scripts/mac-linux/.adapter_pid"
echo "$CELERY_PID" > "$ROOT_DIR/scripts/mac-linux/.celery_pid"
echo "$CELERY_BEAT_PID" > "$ROOT_DIR/scripts/mac-linux/.celery_beat_pid"
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
echo -e "  Adapter   ->  \033[1;37mhttp://localhost:9000\033[0m"
echo -e "  Adapter Docs -> \033[1;37mhttp://localhost:9000/docs\033[0m"
echo -e "  Redis     ->  \033[1;37mlocalhost:6379\033[0m"
echo ""
echo -e "Logs are being written to:"
echo -e "  - backend/backend.log"
echo -e "  - tracking-provider-adapter/adapter.log"
echo -e "  - backend/celery.log"
echo -e "  - backend/celery-beat.log"
echo -e "  - frontend/frontend.log"
echo ""
echo -e "\033[1;30m  To stop all services, run: ./scripts/mac-linux/stop.sh\033[0m"
echo ""
