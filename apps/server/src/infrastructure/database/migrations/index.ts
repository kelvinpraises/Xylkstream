import "dotenv/config";
import { promises as fs } from "fs";
import { FileMigrationProvider, Migrator } from "kysely";
import * as path from "path";
import { fileURLToPath } from "url";
import yargs from "yargs";
import { initDatabase } from "../connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const db = await initDatabase();

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: __dirname,
    }),
  });

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
