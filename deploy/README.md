# EC2 infrastructure: PostgreSQL and Redis

This stage starts PostgreSQL 18 and Redis only. It does not deploy the web app,
create application tables, restore data, run workers, or configure HTTPS.

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
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml up -d --wait
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml ps
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT current_database();"'
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec redis redis-cli ping
```

Expect both services to be healthy, database `reel_cast`, and Redis `PONG`.
The next stage is restoring a fresh local dump and checking the imported schema
before starting any workers or Celery Beat.

## Data and credentials

Named volumes retain data when containers restart or are recreated. Volumes are
not backups. Never use `down -v` on this deployment unless deleting all its data
is intentional. Changing `POSTGRES_PASSWORD` in the environment after first
initialization does not change the existing PostgreSQL role's password; rotate it
in PostgreSQL and update `DATABASE_URL` together.
