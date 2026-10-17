# ReelCast latency optimization

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

## Phase 4–5 implementation

### Media and video pipeline

- The multipart API reads at most 1 MiB per copy operation, checks the declared and
  actual size, validates a real video stream and its duration using the bundled
  FFmpeg, and sends a file-backed upload to R2. It no longer reads a video into one
  Python bytes object. Invalid files and temporary copies are cleaned up.
- Managed R2 transfers use 8 MiB parts without upload threads. Downloads stream
  into temporary files. Extended-video concat also uses file-backed downloads and
  uploads rather than accumulating clips in RAM. Provision temporary disk space for
  source and output files; this optimization reduces RAM use, not total disk use.
- A downloaded source is reused for raw persistence, thumbnail extraction and
  overlay. Output MP4s use faststart. Caption work overlaps video work; completed
  video is persisted before awaiting captions so a caption-only retry can reuse it.
  This is not an automatic crash-resume or paid-provider retry system.
- Authorized Reel responses serialize storage keys as direct read URLs with the
  existing one-hour expiry or configured CDN origin. Database fields stay as keys.
  Legacy media proxies redirect to `R2_PUBLIC_URL` when configured; private buckets
  can continue using the proxies. Download attachment behavior is preserved.

### Optional direct multipart uploads

The Create page supports `/api/reel-uploads/init`, `/complete` and `/abort`.
When direct upload is disabled, it uses the existing multipart API automatically.
When enabled, the browser PUTs 8 MiB Blob slices directly to presigned R2 part URLs
and reports ETags to the API. Only completion JSON passes through the web API.

The server binds a 30-minute completion token to the member, product, upload ID,
object key, size and Reel ID. It checks the actual object size and validates media
from a streamed temporary copy before queuing processing. Completion is idempotent;
a lost response retries the same intent, not another video upload. A failed part
aborts the incomplete upload. Storage credentials are never sent to the browser.

To enable on a deployment:

1. Set an R2 CORS policy for the exact frontend origin (example below).
2. Set `DIRECT_VIDEO_UPLOAD_ENABLED=true` in backend configuration and restart it.
3. Confirm a real browser upload and its ETag response against that bucket.
4. Configure lifecycle cleanup for **incomplete multipart uploads**. Do not apply a
   deletion rule to all completed `direct/` objects: accepted Reels use that prefix.

```json
[{
  "AllowedOrigins": ["https://your-frontend.example"],
  "AllowedMethods": ["GET", "HEAD", "PUT"],
  "AllowedHeaders": ["Content-Type", "Range"],
  "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
  "MaxAgeSeconds": 3600
}]
```

The completion API still downloads the object for validation; direct upload avoids
sending the original video through the API upload request, but does not eliminate
all backend/storage traffic. No live bucket configuration was changed here.
See [R2 multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
and [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) for the contracts.

### Frontend

- Library and Reel readers use React Query with member-scoped keys, request
  deduplication, 30s/15s freshness and cancellation/timeouts. Login/logout clears the
  client cache. Successful mutations invalidate lists. API errors retain their
  original user-visible messages.
- Home initially requests 8 Reels and 3 campaigns. Show all uses server totals so
  limiting the initial response does not hide the expansion controls.
- Library loads 20 campaigns per page, with server search/sort, stable ordering,
  total counts and a member-scoped campaign-ID lookup for deep links. Products
  within one campaign and the Create product picker still use complete matching
  lists; product-level pagination remains future work.
- Generation and Distribution polling wait for each request before scheduling the
  next, pause hidden/offline tabs, abort on cleanup and back off errors. Distant
  scheduled distributions use a slower poll. Completed jobs stop polling.
- Shared images default to lazy loading and async decoding; videos preload metadata.
  Auth hero images use Next Image. Both fonts are self-hosted by next/font rather
  than fetched again via a CSS import. Product/fullscreen dialogs load on demand.
- Profile image cache versions use the image key instead of a fresh timestamp on
  each authentication response.

### Verification boundaries

Backend tests use disposable SQLite and mocked R2/provider calls. Browser tests run
against a local production build with mocked APIs. They cover direct multipart and
fallback upload, completion, existing generation, campaign pagination/search,
provider errors and normal auth/distribution behavior. Unit tests additionally
cover owner isolation, idempotency, bounded reads, cleanup, caption/video overlap,
cache isolation and polling cancellation/backoff. These do not establish real R2
CORS correctness, AI latency, production throughput or deployed p95.

## Remaining planned work

- PostgreSQL query-plan verification and index selection against representative
  data. No index or schema changes have been applied to a live database.
- Background manual sync, account-level fan-out and distributed overlap protection.
- Tracking summary/detail API separation and server-side Tracking detail pagination.
- Product-level pagination in large campaigns/pickers; further chart bundle splitting.
- General provider deadlines/retry policies, automatic crash-resume orchestration,
  and email delivery jobs. Paid AI calls are not retried automatically.
- Real R2 upload/CORS verification and production workload tests on the deployment.

The historical first-round checks passed 212 backend tests and 55 frontend tests.
Second-round checks passed 225 backend tests, 64 frontend tests, the production
build, 29 browser regression cases, and the additional Home recent-items case
(the final targeted browser run also rechecked upload and Library pagination).
No paid AI calls, live publications or live database migrations were run.
