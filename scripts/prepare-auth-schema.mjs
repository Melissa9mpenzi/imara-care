import { spawnSync } from "node:child_process";
import { Pool } from "pg";

if (process.env.VERCEL_ENV !== "production") {
  process.exit(0);
}

const connectionString =
  process.env.AUTH_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set AUTH_DATABASE_URL or DATABASE_URL to a PostgreSQL connection string before deploying.",
  );
}

const requiredTables = [
  "user",
  "session",
  "account",
  "verification",
  "twoFactor",
  "jwks",
  "rateLimit",
];

async function findMissingTables(pool) {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth'",
  );
  const existingTables = new Set(rows.map(({ table_name }) => table_name));
  return requiredTables.filter((table) => !existingTables.has(table));
}

const pool = new Pool({ connectionString });
let missingTables;

try {
  await pool.query("CREATE SCHEMA IF NOT EXISTS auth");
  missingTables = await findMissingTables(pool);
} finally {
  await pool.end();
}

if (missingTables.length > 0) {
  const isWindows = process.platform === "win32";
  const migration = spawnSync(
    isWindows ? "npm.cmd" : "npm",
    ["run", "auth:migrate"],
    { env: process.env, shell: isWindows, stdio: "inherit" },
  );

  if (migration.error) {
    throw migration.error;
  }
  if (migration.status !== 0) {
    throw new Error(
      `Better Auth schema migration failed with exit code ${migration.status}.`,
    );
  }

  const verificationPool = new Pool({ connectionString });
  try {
    const stillMissing = await findMissingTables(verificationPool);
    if (stillMissing.length > 0) {
      throw new Error(
        `Better Auth migration did not create required auth tables: ${stillMissing.join(", ")}.`,
      );
    }
  } finally {
    await verificationPool.end();
  }
}
