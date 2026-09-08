# ReelCast — Setup and Run Guide

> **Senior Project** — AI-Powered Social Media Reel Generator  
> Stack: FastAPI · Celery · Redis · Next.js (Bun) · Cloudflare R2 · LTX Video 2.3 · Google Gemini

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
| `FAL_KEY`                | fal.ai API key for LTX Video 2.3 video generation |
| `DATABASE_URL`           | PostgreSQL connection string                      |
| `TOKEN_ENCRYPTION_KEY`   | (Feature 3) Encrypts SocialAccount tokens at rest — optional locally, has a dev-only fallback |
| `BACKEND_URL`            | (Feature 3) Base URL for OAuth redirect URIs — see note below before testing Connect Account |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | (Feature 3) TikTok Content Posting API app credentials |
| `META_APP_ID` / `META_APP_SECRET`            | (Feature 3) Meta app credentials — covers both Facebook and Instagram |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`| (Feature 3) Google Cloud OAuth client for YouTube uploads |

> **Note:** `GOOGLE_AI_API_KEY` must be from a Google Cloud Project with Billing enabled.  
> Free Tier will result in Error 429 RESOURCE_EXHAUSTED.

> **Note (Feature 3 — testing "Connect Account"):** `BACKEND_URL` defaults to
> `http://localhost:8000`, which only works for the YouTube connect flow —
> TikTok rejects localhost/127.0.0.1 redirect URIs outright (requires public
> HTTPS), and Meta requires HTTPS even for localhost. To test any connect
> flow, run `ngrok http 8000` (free static domain), then set **both**
> `BACKEND_URL` in `backend/.env.local` **and** `NEXT_PUBLIC_OAUTH_API_URL` in
> `frontend/.env.local` to that same ngrok URL (with `/api` appended to the
> frontend value). Register the resulting redirect URI in each platform's
> developer settings. Only needed for the OAuth roundtrip itself — normal
> usage, including publishing once an account is connected, never touches
> ngrok.

### E2E Testing — Create `e2e/.env.test`

Copy from `e2e/.env.test.example` and fill in the values:

```bash
cp e2e/.env.test.example e2e/.env.test
```

| Variable       | Description                                 |
| -------------- | ------------------------------------------- |
| `FRONTEND_URL` | Frontend URL used by Playwright tests       |
| `BACKEND_URL`  | Backend URL used by Playwright tests        |
| `PG_HOST`      | PostgreSQL host matching backend connection |
| `PG_PORT`      | PostgreSQL port matching backend connection |
| `PG_DATABASE`  | PostgreSQL database name                    |
| `PG_USER`      | PostgreSQL user                             |
| `PG_PASSWORD`  | PostgreSQL password                         |

---

## ⚡ Quick Start (One Command)

> **Start all services with a single command** — Docker, Backend, Celery, and Frontend will all launch automatically.

### Prerequisites

- Docker Desktop must be **running** before executing the script.
- Python must be installed and available on `PATH` for backend dependency setup.
- Bun must be installed and available on `PATH` for frontend dependency setup.
- Node.js/npm must be installed and available on `PATH` when using `start-and-test`.

```bash
# ===== WINDOWS (CMD) =====
# start all services.
powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1

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

1. Create the backend virtual environment if needed, then install/update backend dependencies from `backend/requirements.txt`
2. Install/update frontend dependencies with `bun install`
3. Start **Redis** via Docker (`docker compose up -d`)
4. Create the `tracking-provider-adapter` virtual environment if needed, install its dependencies, then open a new terminal → start it (FastAPI) on port 9000
5. Open a new terminal → activate venv → start **FastAPI** backend on port 8000
6. Open a new terminal → activate venv → start **Celery Worker**
7. Open a new terminal → activate venv → start **Celery Beat** (F3 scheduled Distribution auto-publish + F5 tracking data sync — separate process from the Worker, see STEP 4 below)
8. Open a new terminal → start **Next.js Frontend** on port 3000

The start-and-test script installs E2E dependencies and Playwright browsers, starts the services in deterministic test mode, then runs backend unit, frontend unit, UI unit E2E, and non-external system E2E suites.

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

### STEP 2 — Tracking Provider Adapter (F5, FastAPI / uvicorn)

Open a new terminal and navigate to `tracking-provider-adapter` (separate
virtual environment from `backend`'s — see its own README for first-time
setup):

```bash
cd tracking-provider-adapter
.venv\Scripts\activate
uvicorn app.main:app --reload --port 9000
```

Verify: `curl http://localhost:9000/health` returns `{"status":"ok"}`

---

### STEP 3 — Backend (FastAPI / uvicorn)

Open a new terminal and navigate to `backend`:

```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Verify: Open [http://localhost:8000/docs](http://localhost:8000/docs)

---

### STEP 4 — Celery Worker

Open another new terminal and navigate to `backend`:

```bash
cd backend
venv\Scripts\activate
venv\Scripts\celery -A app.worker.celery_app worker --loglevel=info --pool=solo -Q main-queue
```

Verify: Seeing `celery@... ready.` = Success

---

### STEP 5 — Celery Beat (F3 scheduled distribution + F5 data tracking)

Open another new terminal and navigate to `backend`:

```bash
cd backend
venv\Scripts\activate
venv\Scripts\celery -A app.worker.celery_app beat --loglevel=info
```

Verify: Seeing `Scheduler: Sending due task check-scheduled-distributions` (every 60s) = Success

> **This is a separate process from the Celery Worker in STEP 4 — both must be
> running.** Worker executes tasks; Beat only watches the clock and queues
> two periodic tasks for the Worker to pick up: `checkScheduledDistributions`
> every 60 seconds (F3 — auto-publish Distributions once their
> `scheduled_time` arrives) and `syncTrackingData` every 15 minutes (F5 —
> refresh connected shop/social performance data). Without Beat running, a
> scheduled Distribution just sits at status `Pending` forever and tracking
> data never refreshes on its own — Publish Now still works fine since that
> path skips Beat entirely.

---

### STEP 6 — Frontend (Next.js / bun)

Open a new terminal and navigate to `frontend`:

```bash
cd frontend
bun run dev
```

Verify: Open [http://localhost:3000](http://localhost:3000)

---

## Port Summary

| Service       | URL                          |
| ------------- | ----------------------------- |
| Frontend      | http://localhost:3000        |
| Backend API   | http://localhost:8000        |
| API Docs      | http://localhost:8000/docs   |
| Tracking Adapter      | http://localhost:9000        |
| Tracking Adapter Docs | http://localhost:9000/docs   |
| Redis         | localhost:6379                |

---

## Testing

### Backend Unit Tests

Backend unit tests cover service and route behavior from the test plan.

```bash
cd backend
venv\Scripts\python -B -m pytest
```

### Frontend Unit Tests

```bash
cd frontend
bun run test
```

### E2E Testing (Playwright)

End-to-End testing is handled using Playwright in the `e2e` directory. Ensure Node.js/npm is installed.

The `start-and-test` scripts install/update E2E dependencies automatically before starting services. To install them manually:

```bash
cd e2e
npm install
npx playwright install
```

#### Run Test Suites

Playwright contains two projects:

- UI unit tests with mocked backend routes: `npm run test:ui-unit`
- System E2E tests against frontend, backend, and PostgreSQL: `npm run test:system`
- Provider/infrastructure-dependent system tests: `npm run test:system:external`
- All Playwright tests including external: `npm run test:all`

For the non-external system suite, start the backend with `REELCAST_TEST_MODE=true`. See `docs/testing/TEST_STRATEGY.md` and `docs/testing/TRACEABILITY.md`.

#### Debugging

To run tests with a UI for debugging:

```bash
npm run test:ui
```

---

## Installing Dependencies Manually

The start scripts install/update backend and frontend dependencies automatically before launching services. Use these commands only when you want to prepare dependencies manually.

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
cd backend
venv\Scripts\python -m pip install --upgrade -r requirements.txt

# Install google-genai (if missing)
venv\Scripts\python -m pip install google-genai --upgrade
```

---

## Database Schema Notes

The backend expects the PostgreSQL schema to already contain the columns defined in `backend/app/models/models.py`. Startup no longer runs automatic `ALTER TABLE` migrations.

Important Reel storage fields:

- `raw_video_url` stores the original video before overlays/logos.
- `first_frame_url` stores the Gemini-generated first-frame image URL.
- `final_commercial_video_url` stores the finalized MP4 with overlays.

**There is no migration framework (no Alembic)** — `app/main.py` only calls
`Base.metadata.create_all()`, which creates missing tables but never adds
columns to tables that already exist. If your local database predates a
model change, run `backend/schema_fixes.sql` once against it:

```bash
psql -U postgres -d reel_cast -f backend/schema_fixes.sql
```

Add new fixes to that file (don't add automatic migrations) whenever a
model gains a column, so everyone on the team stays in sync.

## Feature 5: Data Tracking connector setup

Run `backend/schema_fixes.sql` before using Feature 5. It creates the
e-commerce account table and adds idempotency/revenue fields to analytics.
Then copy the Feature 5 variables in `backend/.env.example` into
`backend/.env.local`.

Each `TRACKING_<PLATFORM>_SYNC_URL` points to a **server-side adapter** for
that platform. The ReelCast worker POSTs this payload to the adapter; it is
never called from the browser:

```json
{
  "platform": "shopee",
  "account_id": "reelcast-account-uuid",
  "external_account_id": "provider-shop-or-channel-id",
  "access_token": "decrypted-provider-token",
  "from_date": "2026-07-18",
  "to_date": "2026-08-17"
}
```

The adapter must respond with a normalized JSON payload. `external_ref` must
be stable per order/post/event so retries update the metric instead of adding
it twice. `product_id` and `distribution_id` must belong to the signed-in
ReelCast Member when supplied.

```json
{
  "metrics": [
    {
      "external_ref": "provider-order-or-post-id",
      "record_date": "2026-08-17",
      "product_id": "optional-reelcast-product-uuid",
      "distribution_id": "optional-reelcast-distribution-uuid",
      "views": 1200,
      "clicks": 48,
      "orders": 3,
      "revenue": 1290.00
    }
  ]
}
```

Use a separate adapter/key for each provider. It keeps provider-specific
request signing (for example TikTok Shop signatures and Shopee/Lazada partner
signatures) out of the web app, while ReelCast takes care of encrypted token
storage, retries, deduplication, ownership validation, scheduling, and the
dashboard. The current readiness endpoint is `GET /api/tracking/readiness`;
it exposes only whether each adapter URL is configured, never a URL or secret.

### Shop OAuth (Tracking UI)

The Tracking cards use OAuth exactly like the Distribution cards. Do not ask
members to paste a Shop ID or access token. For each shop, configure these two
adapter values in `.env.local`:

```env
TRACKING_TIKTOK_SHOP_AUTHORIZE_URL=https://your-adapter/authorize?state={state}&redirect_uri={redirect_uri}
TRACKING_TIKTOK_SHOP_TOKEN_EXCHANGE_URL=https://your-adapter/token-exchange
```

Use the corresponding `SHOPEE` or `LAZADA` prefix for those platforms. The
adapter's authorization URL receives the member at the provider consent page;
the callback URL to register is:

```text
{BACKEND_URL}/api/tracking/ecommerce/{tiktok_shop|shopee|lazada}/callback
```

ReelCast sends the callback `code`, `state`, and `redirect_uri` to the token
exchange URL. It must return only this server-side payload:

```json
{
  "access_token": "provider-access-token",
  "refresh_token": "optional-provider-refresh-token",
  "external_shop_id": "provider-shop-id",
  "shop_name": "optional-display-name"
}
```

The frontend displays `Needs setup` until both OAuth URLs for that shop are
configured, then shows `Connect`. Tokens are encrypted immediately in the
backend and are never rendered by the UI.

#### Local Shop OAuth with ngrok

The Shop OAuth callback must be reachable by the provider. Start a tunnel to
the backend with `ngrok http 8000`, then use its public HTTPS domain in both
places below and restart the affected services:

```env
# backend/.env.local
BACKEND_URL=https://your-domain.ngrok-free.app
FRONTEND_URL=http://localhost:3000

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_OAUTH_API_URL=https://your-domain.ngrok-free.app/api
```

Keep the frontend and ordinary API requests local if desired.
`NEXT_PUBLIC_OAUTH_API_URL` is used only by Connect, so the Connect request
and provider callback share a public domain for the OAuth session cookie while
normal browser API requests avoid ngrok's free-tier warning page. Register
these exact callback URLs in the provider consoles:

```text
https://your-domain.ngrok-free.app/api/tracking/ecommerce/tiktok_shop/callback
https://your-domain.ngrok-free.app/api/tracking/ecommerce/shopee/callback
https://your-domain.ngrok-free.app/api/tracking/ecommerce/lazada/callback
```

The adapter remains private on `http://localhost:9000`; do not expose it
through the tunnel.

## Feature 3: Social distribution setup

Feature 3 is ready for the production OAuth credentials already named in
`backend/.env.example`: `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`,
`META_APP_ID`/`META_APP_SECRET`, and
`YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`. Set both `BACKEND_URL` and
`FRONTEND_URL` to the public HTTPS addresses used by your deployment, then
register these callback URLs with the matching platform application:

```text
{BACKEND_URL}/api/social/tiktok/callback
{BACKEND_URL}/api/social/youtube/callback
{BACKEND_URL}/api/social/facebook/callback
{BACKEND_URL}/api/social/instagram/callback
```

For local development, the ngrok configuration in **Local Shop OAuth with
ngrok** applies unchanged to these Social Account connections: use the same
public `BACKEND_URL` and set `NEXT_PUBLIC_OAUTH_API_URL` to that domain plus
`/api`. This ensures that the browser starts the connection and receives the
provider callback on the same session-cookie domain.

The Distribution screen disables a platform that is not configured, and the
authenticated `GET /api/social/readiness` endpoint exposes only a true/false
state for each platform. Restart the FastAPI and Celery processes after
changing `.env.local`; then connect each account from Distribution to complete
the OAuth consent flow. Use real production R2/public video URLs so TikTok,
Meta and Instagram can retrieve the video during publishing.

---

## Core API Surface

The route URLs stay stable for the frontend, while the internal handler names follow the software design document:

| Method description     | Method name                   | Endpoint                               |
| ---------------------- | ----------------------------- | -------------------------------------- |
| Registration           | `registerGuest`               | `POST /register`                       |
| Login                  | `authenticateMember`          | `POST /login`                          |
| Account profile        | `updateAccountProfile`        | `PUT /me`                              |
| 2FA setup verification | `manage2FA`                   | `POST /api/2fa/verify-setup`           |
| Generate Reel          | `inputPromptAndSelectProduct` | `POST /api/reels/generate`             |
| Regenerate content     | `regenerateContent`           | `POST /api/reels/{reel_id}/regenerate` |
| Upload own Reel        | `uploadOwnReel`               | `POST /api/reels/upload-video`         |
| Approve preview        | `previewAndApproveContent`    | `POST /api/reels/{reel_id}/approve`    |
| Browse library         | `browseLibrary`               | `GET /api/library`                     |
| Create campaign        | `createCampaign`              | `POST /api/campaigns`                  |
| Create product         | `createProduct`               | `POST /api/products`                   |

---

## Troubleshooting

| Issue                        | Cause / Solution                                            |
| ---------------------------- | ----------------------------------------------------------- |
| Celery not receiving tasks   | Must include `-Q main-queue` flag                           |
| Celery crashes on Windows    | Must use `--pool=solo` (prevents WinError 5)                |
| Error 429 RESOURCE_EXHAUSTED | GOOGLE_AI_API_KEY requires a Billing project, not Free Tier |
| Celery executing old tasks   | Must restart Celery whenever task signatures are modified   |
| Scheduled Distribution stuck on `Pending` past its `scheduled_time` | Celery Beat (STEP 4) isn't running — it's a separate process from the Worker. Publish Now still works without it; only the 60s auto-publish check needs Beat. |
| YouTube publish fails with `401 Unauthorized` | The connected account's access token expired (~1h) and had never been refreshed before this was fixed — should no longer happen; if it does, reconnect the account |

---

## Project Structure

```
reelcastcast/
├── backend/                  # FastAPI + Celery
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── worker.py         # Celery task (video generation pipeline)
│   │   ├── exceptions.py     # Domain exceptions from the design document
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
├── e2e/                      # Playwright UI unit and system E2E testing
│   ├── helpers/              # UI mocks and system/database fixtures
│   └── tests/                # Test specifications
│       ├── ui-unit/          # Browser unit scope with mocked APIs
│       └── system/           # Full-stack E2E scenarios
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

| Service       | Model              | Purpose                                               |
| ------------- | ------------------ | ----------------------------------------------------- |
| fal.ai        | LTX Video 2.3 fast | Video generation from first frames or text prompts    |
| Google Gemini | gemini-3.5-flash   | Prompt building, captions, and hashtags generation    |
| Google Gemini | gemini-3-pro-image | Product-aware cinematic first-frame generation        |
| Cloudflare R2 | —                  | Storing video files, first frames, and product images |
