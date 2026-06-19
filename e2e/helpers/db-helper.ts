/**
 * db-helper.ts
 * ─────────────────────────────────────────────────────────────────────
 * Manages a PostgreSQL connection pool for the E2E test environment.
 *
 * Responsibilities:
 *  • Connect to the same database the FastAPI backend uses.
 *  • Provide typed query helpers to verify data written during tests.
 *  • Clean up test data after each suite to keep the DB pristine.
 *  • Expose pool lifecycle helpers (connect / disconnect).
 *
 * Security note:
 *  Connection credentials are loaded from `.env.test` via dotenv in the
 *  Playwright config, so they never leak into source control.
 * ─────────────────────────────────────────────────────────────────────
 */

import { Pool, PoolConfig, QueryResult } from "pg";

// ─── Connection Configuration ───────────────────────────────────────

const poolConfig: PoolConfig = {
  host: process.env.PG_HOST ?? "localhost",
  port: Number(process.env.PG_PORT ?? 5432),
  database: process.env.PG_DATABASE ?? "reel_cast",
  user: process.env.PG_USER ?? "postgres",
  password: process.env.PG_PASSWORD ?? "",
  max: 3,               // keep pool small — tests don't need high concurrency
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
};

let pool: Pool | null = null;

// ─── Pool Lifecycle ─────────────────────────────────────────────────

/**
 * Initialises the connection pool (idempotent).
 * Call once in `beforeAll` or in a global setup fixture.
 */
export async function connectDB(): Promise<Pool> {
  if (!pool) {
    pool = new Pool(poolConfig);
    // Verify the connection is actually alive
    const client = await pool.connect();
    client.release();
    console.log(
      `[db-helper] Connected to PostgreSQL ➜ ${poolConfig.host}:${poolConfig.port}/${poolConfig.database}`
    );
  }
  return pool;
}

/**
 * Gracefully shuts down the pool.
 * Call in `afterAll` or in a global teardown fixture.
 */
export async function disconnectDB(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[db-helper] PostgreSQL pool closed.");
  }
}

// ─── Generic Query Helper ───────────────────────────────────────────

/**
 * Execute a parameterised query against the test database.
 *
 * @example
 * const rows = await query<UserRow>("SELECT * FROM users WHERE email = $1", ["alice@test.com"]);
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (!pool) {
    throw new Error("[db-helper] Pool not initialised. Call connectDB() first.");
  }
  return pool.query<T>(text, params);
}

// ─── Domain-Specific Query Helpers ──────────────────────────────────

/** Shape of a row returned by the `users` table. */
export interface UserRow {
  [key: string]: unknown;
  user_id: string;
  email: string;
  display_name: string | null;
  hashed_password: string | null;
  is_email_verified: boolean;
  is_2fa_enabled: boolean;
  two_factor_secret: string | null;
  profile_image: string | null;
  created_at: Date;
}

/**
 * Fetch a user by email.
 * Returns `null` when the user doesn't exist.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return rows[0] ?? null;
}

/**
 * Delete a user by email.
 * Useful for cleanup in `afterAll` / `afterEach`.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  await query("DELETE FROM users WHERE email = $1", [email]);
}

/**
 * Mark a user's email as verified directly in the database.
 * Useful for setting up pre-conditions (e.g. the login test needs
 * a user who has already verified their email).
 */
export async function verifyUserEmail(email: string): Promise<void> {
  await query("UPDATE users SET is_email_verified = true WHERE email = $1", [email]);
}

export async function configureUser2FA(
  email: string,
  secret: string,
  enabled = true,
): Promise<void> {
  await query(
    `UPDATE users
     SET two_factor_secret = $2, is_2fa_enabled = $3
     WHERE email = $1`,
    [email, secret, enabled],
  );
}

/**
 * Count all users with a given email.
 * Handy to assert exactly 1 record was inserted.
 */
export async function countUsersByEmail(email: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM users WHERE email = $1",
    [email]
  );
  return parseInt(rows[0].count, 10);
}

// ─── Campaign Helpers ───────────────────────────────────────────────

/** Shape of a row returned by the `campaigns` table. */
export interface CampaignRow {
  [key: string]: unknown;
  campaign_id: string;
  user_id: string;
  name: string;
  description: string | null;
  banner_color: string | null;
  banner_image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Fetch a campaign by name (scoped to a user).
 */
export async function findCampaignByName(
  name: string,
  userId?: string
): Promise<CampaignRow | null> {
  const sql = userId
    ? "SELECT * FROM campaigns WHERE name = $1 AND user_id = $2 LIMIT 1"
    : "SELECT * FROM campaigns WHERE name = $1 LIMIT 1";
  const params = userId ? [name, userId] : [name];
  const { rows } = await query<CampaignRow>(sql, params);
  return rows[0] ?? null;
}

/**
 * Delete all campaigns belonging to a user.
 * Useful for cleanup since campaigns cascade to products.
 */
export async function deleteCampaignsByUserId(userId: string): Promise<void> {
  await query("DELETE FROM campaigns WHERE user_id = $1", [userId]);
}

// ─── Product Helpers ────────────────────────────────────────────────

/** Shape of a row returned by the `products` table. */
export interface ProductRow {
  [key: string]: unknown;
  product_id: string;
  user_id: string;
  campaign_id: string;
  product_name: string;
  description: string | null;
  affiliate_link: string | null;
  brand_logo_url: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Fetch a product by name.
 */
export async function findProductByName(name: string): Promise<ProductRow | null> {
  const { rows } = await query<ProductRow>(
    "SELECT * FROM products WHERE product_name = $1 LIMIT 1",
    [name]
  );
  return rows[0] ?? null;
}

// ─── Reel Helpers ───────────────────────────────────────────────────

/** Shape of a row returned by the `reels` table. */
export interface ReelRow {
  [key: string]: unknown;
  reel_id: string;
  user_id: string;
  product_id: string | null;
  prompt_text: string;
  status: string;
  final_commercial_video_url: string | null;
  raw_video_url: string | null;
  caption_and_hashtags: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
}

/**
 * Fetch a reel by ID.
 */
export async function findReelById(reelId: string): Promise<ReelRow | null> {
  const { rows } = await query<ReelRow>(
    "SELECT * FROM reels WHERE reel_id = $1 LIMIT 1",
    [reelId]
  );
  return rows[0] ?? null;
}

/**
 * Delete all reels belonging to a user.
 */
export async function deleteReelsByUserId(userId: string): Promise<void> {
  await query("DELETE FROM reels WHERE user_id = $1", [userId]);
}
