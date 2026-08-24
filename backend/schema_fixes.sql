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

-- 2026-08-24: MVP commerce attribution and outbound click tracking.
-- Product.affiliate_link already stores the optional Lazada affiliate URL;
-- no duplicate Product column is needed. Existing distributions need only the
-- nullable platform post ID added below. New tables are also created by
-- SQLAlchemy for fresh databases.
ALTER TABLE distributions ADD COLUMN IF NOT EXISTS platform_post_id VARCHAR;

CREATE TABLE IF NOT EXISTS attribution_links (
    attribution_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    reel_id UUID NOT NULL REFERENCES reels(reel_id) ON DELETE CASCADE,
    distribution_id UUID NOT NULL REFERENCES distributions(distribution_id) ON DELETE CASCADE,
    platform VARCHAR NOT NULL,
    affiliate_network VARCHAR NOT NULL,
    affiliate_url VARCHAR NOT NULL,
    sub_id VARCHAR NOT NULL UNIQUE,
    route_type VARCHAR NOT NULL DEFAULT 'direct_link',
    token VARCHAR NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT attribution_links_distribution_network_route_unique
        UNIQUE (distribution_id, affiliate_network, route_type)
);
CREATE INDEX IF NOT EXISTS attribution_links_token_idx ON attribution_links (token);

-- Existing databases may already have the original default from this MVP.
ALTER TABLE attribution_links ALTER COLUMN affiliate_network DROP DEFAULT;

CREATE TABLE IF NOT EXISTS outbound_clicks (
    outbound_click_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attribution_link_id UUID NOT NULL REFERENCES attribution_links(attribution_link_id) ON DELETE CASCADE,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    referrer TEXT,
    user_agent TEXT,
    ip_hash VARCHAR
);
CREATE INDEX IF NOT EXISTS outbound_clicks_attribution_link_id_idx
    ON outbound_clicks (attribution_link_id);

-- 2026-08-24: Repair social metrics synchronized before platform_post_id was
-- used to associate them with their ReelCast Distribution.  The update is
-- idempotent and only attaches metrics whose provider reference matches a
-- post published by the same connected social account.
UPDATE analytics AS metric
SET
    distribution_id = distribution.distribution_id,
    product_id = COALESCE(metric.product_id, reel.product_id)
FROM distributions AS distribution
JOIN reels AS reel ON reel.reel_id = distribution.reel_id
JOIN social_accounts AS account ON account.account_id = distribution.account_id
WHERE metric.distribution_id IS NULL
  AND distribution.platform_post_id IS NOT NULL
  AND metric.source_platform = account.platform_name
  AND metric.external_ref = lower(account.platform_name) || ':' || distribution.platform_post_id;
