# ReelCast latency optimization — first implementation round

## Changes

- Synchronous authentication queries run in FastAPI's thread pool. R2 upload/delete
  and product-context reads no longer hold the API event loop while doing blocking I/O.
- Manual sync preserves its existing response contract and runs in a thread pool.
  It still waits for provider completion; it has not yet become a background job.
- Frontend API and media origins use `src/lib/api-config.ts`. Set
  `NEXT_PUBLIC_API_URL=https://your-backend/api` **before building**. Auth endpoints
  use the corresponding backend root. Optional `NEXT_PUBLIC_OAUTH_API_URL` is retained.
- Generate, caption, publish, scheduled-distribution scans, and tracking sync have
  dedicated queues/workers. Conditional regeneration claims prevent overlapping
  caption/video requests from changing the same Reel concurrently.
- Tracking detail reads use two queries regardless of link count: latest owned
  observations via a window function, and links with grouped click counts.
- Click trends aggregate by Bangkok calendar day in SQL. Comparison coverage uses
  a SQL maximum. Comparison exports reuse the two period reads rather than reading
  details five times. Filter options eagerly load products/campaigns.
- API responses include `Server-Timing` and `X-Request-ID`. The performance logger
  records route templates, total request time, successful SQL statement count and
  cursor execution time. It does not log SQL text, parameters, tokens or query strings.
  Statement time excludes pool waits and ORM result hydration; total request time
  includes response streaming. Header timings stop when response headers are sent.
- Celery logs queue wait, execution time and individual AI/video/storage stages.
  Queue wait compares producer/worker clocks; keep hosts time-synchronized.

## Running workers

The updated start scripts launch separate workers automatically. On Windows they
run hidden and write `backend/celery-<kind>.log` and `.err.log`; the stop script
matches this checkout's Python executable. On Unix each worker has its own PID file.

For manual Windows startup, run each command in a separate terminal in `backend`:

```cmd
worker.cmd generation
worker.cmd caption
worker.cmd publish
worker.cmd scheduler
worker.cmd sync
```

For Linux deployment, use separate supervised processes (one example per kind):

```sh
celery -A app.worker.celery_app worker -n generation@%h -Q generation-queue,main-queue -c 1 --loglevel=info
celery -A app.worker.celery_app worker -n caption@%h -Q caption-queue -c 1 --loglevel=info
celery -A app.worker.celery_app worker -n publish@%h -Q publish-queue -c 1 --loglevel=info
celery -A app.worker.celery_app worker -n scheduler@%h -Q scheduler-queue -c 1 --loglevel=info
celery -A app.worker.celery_app worker -n sync@%h -Q sync-queue -c 1 --loglevel=info
celery -A app.worker.celery_app beat --loglevel=info
```

Run exactly one Beat scheduler. Provision memory for the separate processes; queue
separation does not isolate CPU/RAM unless deployment resources are also separated.
The generation worker drains legacy `main-queue` messages. Do not purge that queue.
Restart API, workers and Beat with this version together; an old worker listening
only to `main-queue` will not consume newly routed tasks. New queues alone do not
make provider calls faster. The scheduled publish scan remains every 60 seconds.

## Measured local result

Disposable in-memory SQLite, three read samples per case, 30 observations and one
click per link. The comparison loads the previous `detail_rows` from Git HEAD;
both readers use the same seeded data. Every row's values must match. These are
service-level results, not browser/API p95 or PostgreSQL production measurements.

| Links | Observations | Queries before → after | Median before → after |
|---:|---:|---:|---:|
| 10 | 300 | 12 → 2 | 18.59 → 2.93 ms |
| 100 | 3,000 | 102 → 2 | 168.80 → 15.11 ms |
| 1,000 | 30,000 | 1,002 → 2 | 3,055.63 → 187.12 ms |

Dashboard query-count regression: five queries at both 1 and 101 links. The tests
also cover ownership, latest lifetime counters, unavailable values, Bangkok date
boundaries, export consistency, thread-pool timing propagation, non-blocking storage,
queue routing and overlapping regeneration claims.

Reproduce from `backend` before committing this implementation:

```sh
python -B scripts/benchmark_tracking.py --compare-ref HEAD
```

After committing, use the commit immediately before this change instead of HEAD,
or omit `--compare-ref` to measure only the current implementation.

## Remaining planned work

- PostgreSQL query-plan verification and index selection against representative
  data. No index or schema changes have been applied to a live database.
- Background manual sync, account-level fan-out and distributed overlap protection.
- Server-side detail pagination and summary/detail API separation; dashboard still
  computes all matching detail rows and returns them using its existing contract.
- Direct/multipart uploads, bounded-memory video processing and direct/CDN media
  delivery. Uploads still buffer video bytes; the 500 MiB limit is unchanged.
- File reuse and parallel caption/video stages, provider deadlines/retry policies,
  durable progress checkpoints, and email delivery jobs.
- Client request deduplication, request cancellation/timeouts, adaptive polling,
  Library pagination and font/media loading improvements.
- Production workload tests and real p95/queue-wait targets on the chosen topology.

Validation for this round: 212 backend tests, 55 frontend tests, TypeScript,
production frontend build, and Windows/Unix script syntax checks all passed.
No paid AI calls, live publications, service restarts or
live database migrations are needed for these checks.
