import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import type { PoolClient } from "pg";
import { authDatabase, ensureAuthSupportTables } from "../src/lib/auth-database";

const sourcePath = resolve(process.cwd(), "imara-care-auth.db");
const sourceTables = [
  "user",
  "account",
  "session",
  "verification",
  "twoFactor",
  "jwks",
  "rateLimit",
  "staff_invitations",
  "auth_audit_events",
  "auth_login_limits",
  "auth_mfa_setup_pending",
  "auth_local_mailbox",
  "auth_local_two_factor_mailbox",
] as const;
const copyOrder = [
  "user",
  "account",
  "session",
  "verification",
  "twoFactor",
  "jwks",
  "rateLimit",
  "staff_invitations",
  "auth_audit_events",
  "auth_login_limits",
  "auth_mfa_setup_pending",
  "auth_local_mailbox",
  "auth_local_two_factor_mailbox",
] as const;
const verifyOnly = process.argv.includes("--verify-only");

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unexpected database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function migrate() {
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite authentication database not found: ${sourcePath}`);
  }

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  let client: PoolClient | undefined;
  const backupPath = verifyOnly
    ? undefined
    : resolve(
        process.cwd(),
        `imara-care-auth.pre-postgres-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.db`,
      );
  let transactionStarted = false;

  try {
    if (backupPath) await source.backup(backupPath);
    await ensureAuthSupportTables();
    const connectedClient = await authDatabase.connect();
    client = connectedClient;

    const foundSourceTables = new Set(
      (source
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as { name: string }[]
      ).map(({ name }) => name),
    );
    const missingSourceTables = sourceTables.filter(
      (table) => !foundSourceTables.has(table),
    );
    const unexpectedSourceTables = [...foundSourceTables].filter(
      (table) => !sourceTables.includes(table as (typeof sourceTables)[number]),
    );
    if (missingSourceTables.length || unexpectedSourceTables.length) {
      throw new Error(
        [
          missingSourceTables.length
            ? `Missing SQLite tables: ${missingSourceTables.join(", ")}`
            : "",
          unexpectedSourceTables.length
            ? `Unrecognized SQLite tables: ${unexpectedSourceTables.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join(". "),
      );
    }

    const targetColumns = await connectedClient.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'auth'`,
    );
    const columnsByTable = new Map<
      string,
      Map<string, { dataType: string; nullable: boolean; defaultValue: string | null }>
    >();
    for (const column of targetColumns.rows) {
      const columns =
        columnsByTable.get(column.table_name) ?? new Map();
      columns.set(column.column_name, {
        dataType: column.data_type,
        nullable: column.is_nullable === "YES",
        defaultValue: column.column_default,
      });
      columnsByTable.set(column.table_name, columns);
    }

    const sourceRowsByTable = new Map<string, Record<string, unknown>[]>();
    for (const tableName of copyOrder) {
      const quotedTable = quoteIdentifier(tableName);
      const targetColumnsForTable = columnsByTable.get(tableName);
      if (!targetColumnsForTable) {
        throw new Error(
          `PostgreSQL table auth.${tableName} does not exist. Run the Better Auth PostgreSQL migration first.`,
        );
      }

      const rows = source.prepare(`SELECT * FROM ${quotedTable}`).all() as Record<
        string,
        unknown
      >[];
      const sourceColumnNames = (
        source.prepare(`PRAGMA table_info(${quotedTable})`).all() as {
          name: string;
        }[]
      ).map(({ name }) => name);
      const absentTargetColumns = sourceColumnNames.filter(
        (column) => !targetColumnsForTable.has(column),
      );
      const missingRequiredColumns = [...targetColumnsForTable].filter(
        ([column, metadata]) =>
          !sourceColumnNames.includes(column) &&
          !metadata.nullable &&
          metadata.defaultValue === null,
      );
      if (absentTargetColumns.length || missingRequiredColumns.length) {
        throw new Error(
          `Column mismatch for ${tableName}: ${[
            absentTargetColumns.length
              ? `missing in PostgreSQL: ${absentTargetColumns.join(", ")}`
              : "",
            missingRequiredColumns.length
              ? `missing in SQLite: ${missingRequiredColumns.map(([column]) => column).join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("; ")}`,
        );
      }
      sourceRowsByTable.set(tableName, rows);
    }

    if (!verifyOnly) {
      await connectedClient.query("BEGIN");
      transactionStarted = true;
      for (const tableName of copyOrder) {
        const targetCount = await connectedClient.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM auth.${quoteIdentifier(tableName)}`,
        );
        if (targetCount.rows[0]?.count !== "0") {
          throw new Error(
            `PostgreSQL table auth.${tableName} is not empty; refusing to overwrite existing data.`,
          );
        }
      }

      for (const tableName of copyOrder) {
        const quotedTable = quoteIdentifier(tableName);
        const rows = sourceRowsByTable.get(tableName)!;
        if (rows.length === 0) continue;

        const columns = Object.keys(rows[0]);
        const columnList = columns.map(quoteIdentifier).join(", ");
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        const insert = `INSERT INTO auth.${quotedTable} (${columnList}) VALUES (${placeholders})`;

        for (const row of rows) {
          const values = columns.map((column) => {
            const value = row[column];
            return columnsByTable.get(tableName)!.get(column)?.dataType === "boolean" && value !== null
              ? Boolean(value)
              : value;
          });
          await connectedClient.query(insert, values);
        }
      }
    }

    for (const tableName of copyOrder) {
      const sourceRows = sourceRowsByTable.get(tableName)!;
      const result = await connectedClient.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM auth.${quoteIdentifier(tableName)}`,
      );
      if (result.rows[0]?.count !== String(sourceRows.length)) {
        throw new Error(
          `Verification failed for ${tableName}: expected ${sourceRows.length} rows, found ${result.rows[0]?.count}.`,
        );
      }

      const primaryKeys = (
        source.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as {
          name: string;
          pk: number;
        }[]
      )
        .filter(({ pk }) => pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map(({ name }) => name);
      if (primaryKeys.length === 0) {
        throw new Error(`SQLite table ${tableName} does not have a primary key.`);
      }

      const quotedTable = quoteIdentifier(tableName);
      const orderBy = primaryKeys.map(quoteIdentifier).join(", ");
      const targetRows = await connectedClient.query(
        `SELECT * FROM auth.${quotedTable} ORDER BY ${orderBy}`,
      );
      const targetRowsByKey = new Map(
        targetRows.rows.map((row) => [
          JSON.stringify(primaryKeys.map((key) => String(row[key]))),
          row as Record<string, unknown>,
        ]),
      );
      const targetColumnTypes = columnsByTable.get(tableName)!;
      for (const [rowIndex, sourceRow] of sourceRows.entries()) {
        const key = JSON.stringify(primaryKeys.map((column) => String(sourceRow[column])));
        const targetRow = targetRowsByKey.get(key);
        if (!targetRow) {
          throw new Error(
            `Verification failed for ${tableName}: a source record is missing from PostgreSQL.`,
          );
        }
        for (const [column, sourceValue] of Object.entries(sourceRow)) {
          const targetValue = targetRow[column];
          const dataType = targetColumnTypes.get(column)!.dataType;
          const normalizedSource =
            sourceValue === null
              ? null
              : dataType === "boolean"
                ? Boolean(sourceValue)
                : dataType === "timestamp with time zone" ||
                    dataType === "timestamp without time zone"
                  ? new Date(String(sourceValue)).toISOString()
                  : dataType === "bigint"
                    ? String(sourceValue)
                    : sourceValue;
          const normalizedTarget =
            targetValue === null
              ? null
              : dataType === "timestamp with time zone" ||
                  dataType === "timestamp without time zone"
                ? (targetValue instanceof Date
                    ? targetValue
                    : new Date(String(targetValue))
                  ).toISOString()
                : dataType === "bigint"
                  ? String(targetValue)
                  : targetValue;
          if (normalizedSource !== normalizedTarget) {
            throw new Error(
              `Verification failed for ${tableName}.${column} at row ${rowIndex + 1}.`,
            );
          }
        }
      }
    }

    if (transactionStarted) {
      await connectedClient.query("COMMIT");
      transactionStarted = false;
    }
    console.log(
      verifyOnly
        ? "Authentication records verified against PostgreSQL:"
        : "Authentication records copied to PostgreSQL:",
    );
    for (const tableName of copyOrder) {
      console.log(`  ${tableName}: ${sourceRowsByTable.get(tableName)!.length}`);
    }
    if (backupPath) {
      console.log(`SQLite backup preserved at ${backupPath}`);
    }
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw error;
  } finally {
    client?.release();
    source.close();
    await authDatabase.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Authentication database migration failed.", error);
  process.exitCode = 1;
});
