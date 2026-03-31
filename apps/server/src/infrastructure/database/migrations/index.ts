import "dotenv/config";
import { promises as fs } from "fs";
import type { MigrationProvider, Migration } from "kysely";
import { Migrator } from "kysely";
import * as path from "path";
import { fileURLToPath } from "url";
import yargs from "yargs";
import { initDatabase } from "../connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** FileMigrationProvider that skips index.ts (this CLI file) */
const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    const files = await fs.readdir(__dirname);
    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      if (file === "index.ts" || file === "index.js") continue;
      if (!file.endsWith(".ts") && !file.endsWith(".js")) continue;
      const mod = await import(path.join(__dirname, file));
      migrations[file.replace(/\.[tj]s$/, "")] = mod;
    }
    return migrations;
  },
};

async function run() {
  const db = await initDatabase();

  const migrator = new Migrator({ db, provider: migrationProvider });

  const argv = await yargs(process.argv.slice(2))
    .command("up", "Run all pending migrations")
    .command("down", "Revert the latest migration")
    .demandCommand(1, "Specify a command: up or down")
    .help()
    .parse();

  const command = argv._[0] as string;

  try {
    if (command === "up") {
      const { error, results } = await migrator.migrateToLatest();

      results?.forEach((result) => {
        if (result.status === "Success") {
          console.log(`Migration "${result.migrationName}" applied successfully.`);
        } else if (result.status === "Error") {
          console.error(`Migration "${result.migrationName}" failed.`);
        }
      });

      if (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
      }
    } else if (command === "down") {
      const { error, results } = await migrator.migrateDown();

      results?.forEach((result) => {
        if (result.status === "Success") {
          console.log(`Migration "${result.migrationName}" reverted successfully.`);
        } else if (result.status === "Error") {
          console.error(`Migration "${result.migrationName}" failed to revert.`);
        }
      });

      if (error) {
        console.error("Migration revert failed:", error);
        process.exitCode = 1;
      }
    }
  } finally {
    await db.destroy();
  }
}

run();
