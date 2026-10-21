-- 2026-10-21: Retire unused legacy tracking tables.
-- First back up public.analytics and public.ecommerce_accounts with pg_dump.
-- Deploy the matching model/service/schema cleanup before running this file.
-- Run against the intended ReelCast database with psql -v ON_ERROR_STOP=1.
-- RESTRICT deliberately stops retirement if external dependents still exist.
-- Restoring the backup also requires reverting the application cleanup.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DROP TABLE IF EXISTS public.analytics RESTRICT;
DROP TABLE IF EXISTS public.ecommerce_accounts RESTRICT;
COMMIT;
