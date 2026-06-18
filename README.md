# ReelCast — Setup and Run Guide

> **Senior Project** — AI-Powered Social Media Reel Generator  
> Stack: FastAPI · Celery · Redis · Next.js (Bun) · Cloudflare R2 · LTX Video 2.0 · Google Gemini

---

## Prerequisites

| Tool           | Minimum Version | Notes                                         |
| -------------- | --------------- | --------------------------------------------- |
| Docker Desktop | 4.x+            | Must be running at all times during execution |
| Python         | 3.11+           | For backend + Celery                          |
| Bun            | 1.x+            | For frontend (Next.js)                        |
| Git            | 2.x+            |                                               |
| Node.js        | 18.x+           | For E2E Testing (Playwright)                  |

---

## Environment Variables Setup

### Backend — Create `backend/.env`

Copy from `backend/.env.example` and fill in the values:

```bash
cp backend/.env.example backend/.env
```

| Variable                 | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `SECRET_KEY`             | Secret key for JWT sessions                       |
| `GOOGLE_CLIENT_ID`       | Google OAuth Client ID                            |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth Client Secret                        |
| `FACEBOOK_CLIENT_ID`     | Facebook App ID                                   |
| `FACEBOOK_CLIENT_SECRET` | Facebook App Secret                               |
| `SMTP_SERVER`            | SMTP server (e.g. smtp.gmail.com)                 |
| `SMTP_PORT`              | SMTP port (e.g. 587)                              |
| `SMTP_USERNAME`          | Email for sending verification                    |
| `SMTP_PASSWORD`          | App Password for email                            |
| `R2_ACCESS_KEY_ID`       | Cloudflare R2 Access Key ID                       |
| `R2_SECRET_ACCESS_KEY`   | Cloudflare R2 Secret Access Key                   |
| `R2_ENDPOINT_URL`        | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`   |
| `R2_BUCKET_NAME`         | Cloudflare R2 bucket name                         |
| `R2_PUBLIC_URL`          | (Optional) Custom domain for R2 bucket            |
| `GOOGLE_AI_API_KEY`      | Google AI API key (Requires Billing enabled)      |
| `FAL_KEY`                | fal.ai API key for LTX Video 2.0 video generation |
| `DATABASE_URL`           | PostgreSQL connection string                      |

> **Note:** `GOOGLE_AI_API_KEY` must be from a Google Cloud Project with Billing enabled.  
> Free Tier will result in Error 429 RESOURCE_EXHAUSTED.

---

## ⚡ Quick Start (One Command)

> **Start all services with a single command** — Docker, Backend, Celery, and Frontend will all launch automatically.

### Prerequisites

- Docker Desktop must be **running** before executing the script.
- All dependencies must be installed (see [Installing Dependencies](#installing-dependencies-first-time)).

```bash
# ===== WINDOWS (PowerShell) =====
# Start all services.
.\scripts\windows\start.ps1
# Start all services and run tests.
.\scripts\windows\start-and-test.ps1
# Stop all running services.
.\scripts\windows\stop.ps1

# ===== macOS / Linux (Bash) =====
# Start all services.
./scripts/mac-linux/start.sh
# Start all services and run tests.
./scripts/mac-linux/start-and-test.sh
# Stop all running services.
./scripts/mac-linux/stop.sh
```

The start script will:

1. Start **Redis** via Docker (`docker compose up -d`)
2. Open a new terminal → activate venv → start **FastAPI** on port 8000
3. Open a new terminal → activate venv → start **Celery Worker**
4. Open a new terminal → start **Next.js Frontend** on port 3000

> **Note:** If Docker Desktop is not open, Redis will be skipped with a warning — the other services will still start.

---

## Running the Project (Step-by-Step)

### ⚠️ Before running — Always start Docker Desktop first!

---

### STEP 1 — Redis (Docker)

Open a terminal at the **project root** and run:

```bash
docker-compose up -d
```

Verify: Seeing `reelcast_redis  Started` = Success

---

### STEP 2 — Backend (FastAPI / uvicorn)

Open a new terminal and navigate to `backend`:

```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Verify: Open [http://localhost:8000/docs](http://localhost:8000/docs)

---

### STEP 3 — Celery Worker

Open another new terminal and navigate to `backend`:

```bash
cd backend
venv\Scripts\activate
venv\Scripts\celery -A app.worker.celery_app worker --loglevel=info --pool=solo -Q main-queue
```

Verify: Seeing `celery@... ready.` = Success

---

### STEP 4 — Frontend (Next.js / bun)

Open a new terminal and navigate to `frontend`:

```bash
cd frontend
bun run dev
```

Verify: Open [http://localhost:3000](http://localhost:3000)

---

## Port Summary

| Service     | URL                        |
| ----------- | -------------------------- |
| Frontend    | http://localhost:3000      |
| Backend API | http://localhost:8000      |
| API Docs    | http://localhost:8000/docs |
| Redis       | localhost:6379             |

---

## Testing

### Backend API Connection Test

We have a diagnostic endpoint to verify if all external APIs and services in your `.env` are configured correctly and reachable.

1. Ensure your backend is running (`uvicorn app.main:app --reload --port 8000`).
2. Open your browser or use Postman/cURL to make a GET request to:
   👉 **[http://localhost:8000/test/connections](http://localhost:8000/test/connections)**
3. The response will return a JSON indicating the status (`success`, `error`, or `skipped`) for each service (Database, SMTP, R2, Google AI, fal.ai, OAuth).

### E2E Testing (Playwright)

End-to-End testing is handled using Playwright in the `e2e` directory. Ensure Node.js is installed.

```bash
cd e2e
npm install
```

#### Run Test Suites

Tests are organized into UTC (Unit Test Cases) and STC (System Test Cases):

- Run all tests: `npm test`
- Run all UTC tests: `npm run test:utc`
- Run all STC tests: `npm run test:stc`

#### Run Specific Tests

You can run specific test files via npm:

- Authentication: `npm run test:auth`
- Account Profile: `npm run test:account`
- Library: `npm run test:library`
- Create Reel: `npm run test:create`
- Upload Reel: `npm run test:upload`

#### Debugging

To run tests with a UI for debugging:

```bash
npm run test:ui
```

---

## Installing Dependencies (First Time)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
bun install
```

---

## Additional Commands / System Checks

```bash
# Check which ports are currently open
netstat -ano | findstr "8000 3000 6379"

# Check Docker containers
docker ps

# Update backend dependencies
venv\Scripts\pip install -r requirements.txt

# Install google-genai (if missing)
venv\Scripts\pip install google-genai --upgrade
```

---

## Troubleshooting

| Issue                        | Cause / Solution                                            |
| ---------------------------- | ----------------------------------------------------------- |
| Celery not receiving tasks   | Must include `-Q main-queue` flag                           |
| Celery crashes on Windows    | Must use `--pool=solo` (prevents WinError 5)                |
| Error 429 RESOURCE_EXHAUSTED | GOOGLE_AI_API_KEY requires a Billing project, not Free Tier |
| Celery executing old tasks   | Must restart Celery whenever task signatures are modified   |

---

## Project Structure

```
reelcastcast/
├── backend/                  # FastAPI + Celery
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── worker.py         # Celery task (video generation pipeline)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routes/           # API route handlers
│   │   └── services/
│   │       ├── ai_service.py            # Gemini caption generation
│   │       ├── video_generation_service.py  # LTX Video 2.0 video gen
│   │       ├── overlay_service.py       # FFmpeg overlay + audio strip
│   │       ├── storage_service.py       # Cloudflare R2 upload
│   │       └── upload_service.py        # User video validation
│   ├── requirements.txt
│   └── .env.example
├── e2e/                      # Playwright End-to-End Testing
│   ├── helpers/              # Database test helpers
│   └── tests/                # Test specifications
│       ├── UTC/              # Unit Test Cases (Feature-focused specs)
│       └── STC/              # System Test Cases (Scenario-focused flows)
├── frontend/                 # Next.js 14 App Router
│   └── src/app/(main)/
│       └── create/page.tsx   # Reel creation page (Feature 2)
├── scripts/                  # Dev helper scripts
│   ├── windows/              # Scripts for Windows (PowerShell)
│   │   ├── start.ps1
│   │   ├── start-and-test.ps1
│   │   └── stop.ps1
│   └── mac-linux/            # Scripts for macOS & Linux (Bash)
│       ├── start.sh
│       ├── start-and-test.sh
│       └── stop.sh
├── docs/                     # Project documentation & SRS
├── docker-compose.yml        # Redis container
└── README.md
```

---

## AI Services Used

| Service       | Model                | Purpose                                               |
| ------------- | -------------------- | ----------------------------------------------------- |
| fal.ai        | LTX Video 2.0        | Video generation from product images (image-to-video) |
| Google Gemini | gemini-2.5-flash     | Captions + hashtags generation                        |
| Google Veo    | veo-2.0-generate-001 | Fallback video generation                             |
| Cloudflare R2 | —                    | Storing video files + product images                  |
