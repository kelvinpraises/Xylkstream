import "dotenv/config";
import { promises as fs } from "fs";
import { FileMigrationProvider, Migrator } from "kysely";
import * as path from "path";
import yargs from "yargs";

import { db } from "@/infrastructure/database/turso-connection";

async function migrateToLatest() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This needs to be an absolute path.
      migrationFolder: path.join(__dirname),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to migrate");
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
}

async function migrateDown() {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This needs to be an absolute path.
      migrationFolder: path.join(__dirname),
    }),
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was rolled back successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to roll back migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to migrate down");
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
}

yargs(process.argv.slice(2))
  .command("up", "Run migrations up to the latest version", {}, migrateToLatest)
  .command("down", "Rollback the last migration", {}, migrateDown)
  .demandCommand(1, "You need at least one command before moving on")
  .help().argv;
