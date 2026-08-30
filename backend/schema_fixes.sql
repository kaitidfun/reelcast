-- Manual schema fixes for local/dev databases.
--
-- This project has no migration framework (no Alembic) — app/main.py only
-- calls Base.metadata.create_all(), which creates missing TABLES but never
-- ALTERs columns onto tables that already exist. Whenever a column is added
-- to a model in app/models/models.py, any database created before that
-- change needs the matching ALTER TABLE run manually. Add new fixes below
-- as they come up, newest at the bottom, each dated and explained.

-- 2026-08-08: reels.first_frame_url
-- Added to the Reel model for the Gemini 3 Pro Image + LTX Video 2.3
-- pipeline (worker.py writes this after generating the first frame), but
-- never existed on databases created before that pipeline landed. Any full
-- SQLAlchemy query against Reel (SELECT * style) fails with
-- "psycopg2.errors.UndefinedColumn: column reels.first_frame_url does not
-- exist" until this runs.
ALTER TABLE reels ADD COLUMN IF NOT EXISTS first_frame_url VARCHAR;

-- 2026-08-08: social_accounts.external_account_id
-- Publishing a Reel to a Facebook Page or Instagram Business account needs
-- that Page/IG account's own id, not the OAuth user's id — the connect
-- callback resolves and stores it here right after the token exchange.
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS external_account_id VARCHAR;

-- 2026-08-17: Feature 5 - E-commerce shop connections.
-- New databases receive this through SQLAlchemy create_all; run this block
-- once for existing local/dev databases.
CREATE TABLE IF NOT EXISTS ecommerce_accounts (
    ecommerce_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    platform_name VARCHAR NOT NULL,
    external_shop_id VARCHAR NOT NULL,
    shop_name VARCHAR,
    access_token VARCHAR NOT NULL,
    refresh_token VARCHAR,
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, platform_name, external_shop_id)
);

ALTER TABLE analytics ADD COLUMN IF NOT EXISTS revenue NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS external_ref VARCHAR;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS engagement INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_source_external_ref_unique
    ON analytics (source_platform, external_ref)
    WHERE external_ref IS NOT NULL;
    
-- 2026-08-20: reels.is_saved
-- A Completed reel used to appear in the Library automatically. Now it only
-- shows up once the member explicitly clicks "Save" on the Create page —
-- previewAndApproveContent() sets this column true. Existing Completed rows
-- default to false and won't reappear in Library until re-saved.
ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT false;

-- 2026-08-29: reels.saved_* snapshot columns
-- True versioning for Save: Library/Distribute/publishing now read these
-- instead of the live prompt_text/caption_and_hashtags/*_video_url columns,
-- so editing or regenerating a reel after saving it doesn't change what's
-- already visible/publishable until the member explicitly saves again.
-- previewAndApproveContent() copies live -> saved_* on Save; the worker
-- resets is_saved to false whenever a (re)generation completes.
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_prompt_text TEXT;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_caption_and_hashtags JSONB;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_raw_video_url VARCHAR;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_first_frame_url VARCHAR;
ALTER TABLE reels ADD COLUMN IF NOT EXISTS saved_final_commercial_video_url VARCHAR;

-- Backfill: reels saved (is_saved=true) before this column existed have no
-- saved_* snapshot yet, so they'd show blank/broken in Library and the
-- Distribute picker until re-saved. Copy their live columns in once. Safe to
-- re-run — only touches rows whose snapshot is still empty.
UPDATE reels
SET saved_prompt_text = prompt_text,
    saved_caption_and_hashtags = caption_and_hashtags,
    saved_raw_video_url = raw_video_url,
    saved_first_frame_url = first_frame_url,
    saved_final_commercial_video_url = final_commercial_video_url
WHERE is_saved = true AND saved_final_commercial_video_url IS NULL;
