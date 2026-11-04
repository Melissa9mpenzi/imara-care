import { loadEnvConfig } from "@next/env";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

loadEnvConfig(process.cwd());

const connectionString = process.env.AUTH_DATABASE_URL;
if (!connectionString) {
  throw new Error("AUTH_DATABASE_URL must point to the PostgreSQL auth schema.");
}

export const authDatabase = new Pool({
  connectionString,
  options: "-c search_path=auth",
});

let supportTablesReady: Promise<void> | undefined;

export function ensureAuthSupportTables() {
  supportTablesReady ??= authDatabase
    .query(`
      CREATE TABLE IF NOT EXISTS staff_invitations (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        staff_role TEXT NOT NULL,
        facility_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_staff_invitations_email
        ON staff_invitations (facility_id, email, expires_at);
      CREATE TABLE IF NOT EXISTS auth_audit_events (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        facility_id TEXT,
        action TEXT NOT NULL,
        email_hash TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_login_limits (
        email_hash TEXT PRIMARY KEY,
        failure_count INTEGER NOT NULL,
        window_started_at TEXT NOT NULL,
        locked_until TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_mfa_setup_pending (
        user_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_local_mailbox (
        email_hash TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_local_two_factor_mailbox (
        email_hash TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `)
    .then(() => undefined);
  return supportTablesReady;
}

export async function queryAuthDatabase<
  Row extends QueryResultRow = QueryResultRow,
>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  await ensureAuthSupportTables();
  let parameterIndex = 0;
  const query = sql.replace(/\?/g, () => `$${++parameterIndex}`);
  return authDatabase.query<Row>(query, [...values]);
}
