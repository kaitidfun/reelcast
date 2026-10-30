# EC2 services: PostgreSQL, Redis, backend and workers

This Compose file includes PostgreSQL 18, Redis, the API, tracking adapter,
five dedicated workers, optional Celery Beat, Next.js and Caddy HTTPS.
Backend port 8000 binds only to the EC2 loopback interface; the adapter,
database and Redis have no host ports.

Use `compose.prod.yml` alone; do not merge it with the local `docker-compose.yml`,
which publishes Redis on the host. Production infrastructure publishes no ports.
Keep EC2 inbound access to SSH (your IP), HTTP, and HTTPS.

## Configuration

Keep these entries in the private `backend/.env.prod` file:

```dotenv
POSTGRES_DB=reel_cast
POSTGRES_USER=reelcast
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_URL_SAFE_PASSWORD
DATABASE_URL=postgresql+psycopg://reelcast:REPLACE_WITH_THE_SAME_PASSWORD@postgres:5432/reel_cast
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
```

The prepared local production environment already contains a generated password.
Transfer it privately instead of committing it. Do not copy `.env.local` to EC2.
These URLs work for future backend/worker containers on the same Compose network;
they are not Windows-local or EC2-host connection URLs. Production application
services must explicitly load `backend/.env.prod` using Compose `env_file`.

The broker and result backend use separate Redis logical databases on one server.
They still share RAM and persistence. Existing local Redis jobs are not migrated.

## Transfer the prepared files

In the existing EC2 SSH session:

```bash
mkdir -p ~/reelcast/backend
chmod 700 ~/reelcast/backend
```

In a separate Windows PowerShell tab:

```powershell
cd D:\Code\ReelCast\reelcastcast
scp -i "C:\.ssh\reelcast-prod.pem" .\compose.prod.yml ubuntu@54.253.117.147:~/reelcast/
scp -i "C:\.ssh\reelcast-prod.pem" .\backend\.env.prod ubuntu@54.253.117.147:~/reelcast/backend/
```

Alternatively, push only the Compose file and this README, pull the branch on EC2,
and transfer the private environment separately. Never push the environment file.

## Start and check (on EC2)

```bash
cd ~/reelcast
chmod 600 backend/.env.prod
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml config --quiet
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d --wait postgres redis
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml ps
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database();"'
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec redis redis-cli ping
```

Expect both services to be healthy, database `reel_cast`, and Redis `PONG`.
The next stage is restoring a fresh local dump and checking the imported schema
before starting any workers or Celery Beat.

## Deploy application services after the database restore

Do not restore the dump again. Keep the existing project and volume names.
The backend and adapter images copy only application code and dependencies;
local environment files, certificates and virtual environments are excluded.
All containers run the Python application as a non-root user.

Prepare and upload from **Windows PowerShell**:

```powershell
cd D:\Code\ReelCast\reelcastcast
& .\deploy\prepare-upload.ps1
scp -i "C:\.ssh\reelcast-prod.pem" .\.artifacts\deploy\reelcast-services.tar.gz ubuntu@54.253.117.147:~/reelcast/
scp -i "C:\.ssh\reelcast-prod.pem" .\backend\.env.prod ubuntu@54.253.117.147:~/reelcast/backend/
```

In the **Ubuntu SSH tab**, prepare the adapter directory:

```bash
mkdir -p ~/reelcast/tracking-provider-adapter
chmod 700 ~/reelcast/tracking-provider-adapter
```

Back in **Windows PowerShell**, transfer the adapter's private environment:

```powershell
scp -i "C:\.ssh\reelcast-prod.pem" .\tracking-provider-adapter\.env.prod ubuntu@54.253.117.147:~/reelcast/tracking-provider-adapter/
```

Then in the **Ubuntu SSH tab**:

```bash
cd ~/reelcast
tar -xzf reelcast-services.tar.gz
chmod 600 backend/.env.prod tracking-provider-adapter/.env.prod
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml config --quiet
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml build backend tracking-provider-adapter
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d --wait backend tracking-provider-adapter
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec backend python scripts/check_deployment.py
```

The one-shot `migrate` service completes the existing tracking schema migration
before API/workers start. The read-only deployment check verifies model columns,
DB connectivity, both Redis connections and adapter health. If a check fails,
inspect the error and correct it before starting workers. It does not modify
imported data or call a social provider. Adapter key pairs must match the backend;
the prepared production files have been checked locally for all four platforms.
Backend tracking URLs use `http://tracking-provider-adapter:9000/sync/<platform>`.

After checks pass, start all five workers:

```bash
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d worker-generation worker-caption worker-publish worker-sync worker-scheduler
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml ps -a
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml logs --tail=50 backend worker-generation worker-caption worker-publish worker-sync worker-scheduler
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec worker-generation celery -A app.worker.celery_app inspect ping --timeout=10
curl -fsS http://127.0.0.1:8000/api/health
```

Expect `migrate` to exit with code 0, backend/adapter healthy, workers running,
and five worker replies to Celery ping. This is not yet a public web deployment.

### Scheduled publishing and periodic tracking

Beat is behind the `scheduled` profile so the initial startup can be checked
before processing imported schedules. Once started, it queues **every Pending
distribution with no scheduled time or a scheduled time in the past**, including
old imported rows. Review them first (read-only):

```bash
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec postgres psql -U reelcast -d reel_cast -c "SELECT distribution_id, scheduled_time FROM distributions WHERE status = 'Pending' AND (scheduled_time IS NULL OR scheduled_time <= now());"
```

After reviewing the rows and deciding they should be published, start Beat:

```bash
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml --profile scheduled up -d beat
```

Run only one Beat instance for this production DB/broker. Its scheduler state
persists in `beat_data`; `restart: unless-stopped` restarts services after reboot.
Use `logs --tail=100 <service>` for failures. Dependency versions are bounded in
the existing requirements but are not fully locked; builds may resolve newer
compatible versions. Build verification must complete on EC2 before rollout.

## Frontend and public HTTPS

The web archive updates only Compose, Caddy configuration and frontend source.
It contains no environments or database data. Preserve the existing backend,
adapter and named volumes. Do not use `down` or `down -v` for this step.

In Windows PowerShell:

```powershell
cd D:\Code\ReelCast\reelcastcast
& .\deploy\prepare-web-upload.ps1
scp -i "C:\.ssh\reelcast-prod.pem" .\.artifacts\deploy\reelcast-web.tar.gz ubuntu@54.253.117.147:~/reelcast/
```

Then in the Ubuntu SSH tab:

```bash
cd ~/reelcast
tar -xzf reelcast-web.tar.gz
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml config --quiet
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml build frontend
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d --wait frontend
```

Public API/site URLs are Docker build arguments using production domains;
rebuild to change them. Local environment files are excluded. Google HTML
verification defaults to empty; existing DNS verification remains usable.
The image uses the committed npm lockfile with `--legacy-peer-deps` for current
React 19/older UI peer ranges. Google Fonts must be reachable during the build
for the existing Inter font. Runtime uses Next standalone output as user `node`.

Confirm EC2 inbound TCP 80 and 443 are allowed. For initial certificate issuance,
temporarily set Cloudflare records `@`, `api` and `www` to **DNS only**, keeping
the same A/CNAME targets. Wait until public DNS resolves apex/API to
`54.253.117.147`. Set Cloudflare SSL/TLS encryption mode to **Full (strict)**.
Caddy issues public certificates automatically using working DNS and ports
80/443; no Cloudflare API key or manual certificate upload is required.

Validate Caddy, then start it and apply proxy-header support to the API:

```bash
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d --wait backend caddy
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml logs --tail=80 caddy
```

Once logs show certificate issuance succeeded, test from Ubuntu:

```bash
curl --fail --show-error -I https://reelcast.stream
curl --fail --show-error https://api.reelcast.stream/api/health
curl --fail --show-error -I https://www.reelcast.stream
```

Expect frontend success, API health JSON and a www-to-apex redirect. Certificates
persist in `caddy_data` and renew automatically. After direct checks pass,
re-enable Cloudflare **Proxied** for all three records and retain **Full (strict)**.
Repeat the checks through Cloudflare and open the site in a browser. For issuance
errors inspect Caddy logs, DNS and inbound ports before retrying.

Finally verify login, an authenticated API call, media and a tracking sync in
the UI. Provider consoles must allow the production OAuth callback URLs formed
from `BACKEND_URL=https://api.reelcast.stream`; health checks alone do not prove
provider permissions or refresh tokens work. The adapter stays internal without
DNS or public port 9000. Keep only one production Beat instance.

## Data and credentials

Named volumes retain data when containers restart or are recreated. Volumes are
not backups. Never use `down -v` on this deployment unless deleting all its data
is intentional. Changing `POSTGRES_PASSWORD` in the environment after first
initialization does not change the existing PostgreSQL role's password; rotate it
in PostgreSQL and update `DATABASE_URL` together.
