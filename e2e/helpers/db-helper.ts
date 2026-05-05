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
