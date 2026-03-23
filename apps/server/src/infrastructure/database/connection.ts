import { Kysely, ParseJSONResultsPlugin } from "kysely";
import { SQLiteJSONPlugin } from "./json-plugin.js";
import type { DB } from "./schema.js";

let _db: Kysely<DB> | null = null;

export async function initDatabase(): Promise<Kysely<DB>> {
  if (_db) return _db;

  const tursoUrl = process.env.TURSO_APP_DB_URL;

  if (tursoUrl) {
    // Production: Turso/LibSQL
    const { LibsqlDialect } = await import("@libsql/kysely-libsql");
    _db = new Kysely<DB>({
      dialect: new LibsqlDialect({
        url: tursoUrl,
        authToken: process.env.TURSO_APP_DB_TOKEN || "",
      }),
      plugins: [new SQLiteJSONPlugin(), new ParseJSONResultsPlugin()],
    });
  } else {
    // Local dev: better-sqlite3
    const { default: Database } = await import("better-sqlite3");
    const { SqliteDialect } = await import("kysely");
    const sqliteDb = new Database("xylkstream.db");
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    _db = new Kysely<DB>({
      dialect: new SqliteDialect({ database: sqliteDb }),
      plugins: [new SQLiteJSONPlugin(), new ParseJSONResultsPlugin()],
    });
  }

  return _db;
}

export function getDatabase(): Kysely<DB> {
  if (!_db)
    throw new Error(
      "Database not initialized. Call initDatabase() first."
    );
  return _db;
}
