import { createClient } from "@libsql/client";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import dotenv from "dotenv";
import { Kysely, ParseJSONResultsPlugin } from "kysely";

import { DB } from "@/infrastructure/database/schema";
import { SQLiteJSONPlugin } from "@/infrastructure/database/json-plugin";

dotenv.config();

const client = createClient({
  url: process.env.TURSO_APP_DB_URL || "",
  authToken: process.env.TURSO_APP_DB_TOKEN || "",
});

const dialect = new LibsqlDialect({
  client: client as any,
});

export const db = new Kysely<DB>({
  dialect,
  plugins: [new SQLiteJSONPlugin(), new ParseJSONResultsPlugin()],
});
