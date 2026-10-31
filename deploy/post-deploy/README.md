# Post-deployment media recovery plan

Inspection date: 2026-10-31 (Asia/Bangkok).
Scope: read-only inspection of the user's signed-in production Chrome tab,
local source/environment comparison, DNS lookup and R2 object metadata reads.
No production environment, database row or R2 access policy was changed.

## Confirmed evidence

- Production home renders the user's existing campaigns and reels. Nine image
  elements using `cdn.reelcast.stream` did not load; the profile image served
  through the API and two thumbnails from fal.media loaded successfully.
- Opening the existing `folk` reel shows its published distribution records,
  but the player displays `Unable to load video. Please try again.` Its video
  source uses `https://cdn.reelcast.stream/videos/reels/raw/...mp4`.
- DNS lookup for `cdn.reelcast.stream` returns name does not exist.
- Local production environment sets R2_PUBLIC_URL=https://cdn.reelcast.stream;
  the development environment leaves R2_PUBLIC_URL empty. Both environments
  reference `reel-cast-bucket` and have matching R2 credentials/endpoint.
  The remote environment was not read directly; live media URLs demonstrate
  the same CDN behavior in production.
- `get_presigned_url()` in backend/app/services/storage_service.py prioritizes
  R2_PUBLIC_URL when set, bypassing S3 presigning for object keys.
- R2 HEAD confirms the observed `folk` raw video exists (3,492,818 bytes,
  video/mp4). Additional sample image checks are recorded in the task findings;
  no full-bucket inventory or claim that all legacy objects exist was made.

Primary finding: the production media delivery configuration points to an
unconfigured CDN hostname. This explains the observed broken image/video URLs;
it does not imply database restore failure or missing saved records.

## Recovery status and EC2 commands

The user selected signed URLs. The local backend/.env.prod now has an empty
R2_PUBLIC_URL, with a private backup; every other environment entry is preserved.
Compose validation passes. Direct SSH from the assistant tool was rejected at
port 22, so the remote environment is not yet changed and browser recovery is
not yet verified. Execute the following in the user's existing Ubuntu SSH tab
when no generation/publishing task is running:

```bash
cd ~/reelcast
umask 077
cp -p backend/.env.prod "backend/.env.prod.before-signed-media-$(date +%Y%m%d-%H%M%S)"
sed -i 's|^R2_PUBLIC_URL=.*|R2_PUBLIC_URL=|' backend/.env.prod
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml --profile scheduled up -d --no-deps --force-recreate backend worker-generation worker-caption worker-publish worker-sync worker-scheduler beat
```

This changes just R2_PUBLIC_URL on EC2; it does not replace the entire remote
environment with the local file. It requires an existing R2_PUBLIC_URL entry,
as observed in the prepared deployment. Recheck actual container configuration
without displaying any secrets:

```bash
sudo docker compose --env-file backend/.env.prod -f compose.prod.yml exec backend python -c "from app.core.config import R2_PUBLIC_URL; print('Signed URLs enabled:', not bool(R2_PUBLIC_URL))"
```

Expected output: `Signed URLs enabled: True`. Refresh the signed-in browser and
verify that the same saved media now loads. Additional confirmed metadata:
the `folk` thumbnail exists (467,795 bytes, image/png); the sampled product image
HEAD timed out twice, so its existence remains unconfirmed.

## Priority 0: restore media delivery

1. Preserve a private backup of the EC2 backend/.env.prod without displaying
   credentials or committing the backup.
2. Clear R2_PUBLIC_URL in production, using the existing private bucket and
   S3 signed GET URLs, as in local development. Update the local production
   environment consistently. Do not rotate TOKEN_ENCRYPTION_KEY or DB secrets.
3. Recreate backend and the five workers with the updated environment while
   no generation/publishing jobs are running. Apply the same environment to
   the existing Beat service, keeping exactly one Beat instance. A plain
   `docker compose restart` does not update container environment values.
4. Refresh the browser to obtain new serialized media URLs. Verify the Home
   thumbnails, campaign/product images, saved Library media, Distribute video,
   playback seeking and download. Existing R2 keys need no rewrite.
5. Investigate any remaining failure by status: DNS, 403 signature/permissions,
   404 missing object, expired external URL, CORS, or application/API error.
   Confirm requests and object metadata before changing stored references.

No database restore, regeneration, object deletion or public bucket exposure
is required for this first fix. Enabling a public custom domain is a separate
choice: R2 Custom Domains exposes bucket objects publicly; pointing an A record
at the EC2 host alone does not connect a domain to the R2 bucket.

## Priority 1: audit remaining legacy media

- Sample each current member's accessible images and saved reels after the
  delivery fix. Compare API results with DB saved state and object metadata.
- Inventory full external URLs and stale signed URLs in media columns using
  read-only queries first. Full URLs are currently returned unchanged by
  get_presigned_url(), so changing R2_PUBLIC_URL alone will not refresh them.
- For recoverable R2 references, derive and verify the correct object key;
  prepare a dry-run mapping and backup before any targeted migration.
- For expired third-party media with no durable copy, report the affected
  records and recovery source. Do not regenerate billable videos automatically.
- Keep saving durable object keys and resolving access URLs at response time.

## Priority 2: production regression verification

| Flow | Evidence required |
| --- | --- |
| Media | Existing images load; saved videos play/seek/download |
| Upload | New image/video uploads work from reelcast.stream; configure R2 CORS only if request evidence requires it |
| Authentication | Password login and Google/Facebook callbacks complete on production domains |
| Social connections | Expected connected accounts remain; refresh/sync works with retained encryption key |
| Workers | Five Celery workers respond; Beat remains single; check failed tasks |
| Generation/publish | Use an agreed test item; obtain user instruction before billable generation or real publication |
| Persistence | Services recover after restart; production DB backup has a tested restore path in an isolated environment |

## Priority 3: prevent recurrence

- Extend deployment checks with one configured media URL/object HEAD check.
  Adapter health and DB checks alone do not verify media delivery.
- Add a focused regression check for blank/public storage URL selection and
  prevent an unconfigured CDN from being treated as deployment-ready.
- Keep release steps scoped to changed services and never run `down -v`.
- Record the deployed revision and verify application flows after every update.

## References

- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/public-buckets/
