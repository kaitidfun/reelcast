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
