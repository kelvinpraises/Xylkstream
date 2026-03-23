import { Kysely, sql } from "kysely";
import type { DB } from "../schema.js";

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("privy_did", "text", (col) => col.notNull().unique())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("circles")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("owner_user_id", "integer", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("invite_code", "text", (col) => col.notNull().unique())
    .addColumn("encryption_pubkey", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("circle_members")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("circle_id", "integer", (col) =>
      col.notNull().references("circles.id").onDelete("cascade"),
    )
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("encrypted_stealth_address", "text", (col) => col.notNull())
    .addColumn("ephemeral_pubkey", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col
        .notNull()
        .defaultTo("pending")
        .check(sql`status IN ('pending', 'approved', 'rejected')`),
    )
    .addColumn("joined_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("proposals")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("params_json", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status IN ('pending', 'approved', 'rejected', 'executed')`),
    )
    .addColumn("agent_reason", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("executed_at", "text")
    .execute();

  await db.schema
    .createTable("strategies")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("user_id", "integer", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("source_code", "text", (col) => col.notNull())
    .addColumn("bytecode", "text")
    .addColumn("abi_json", "text")
    .addColumn("status", "text", (col) =>
      col.notNull().check(sql`status IN ('pending', 'compiling', 'compiled', 'failed')`),
    )
    .addColumn("errors", "text")
    .addColumn("test_status", "text")
    .addColumn("test_results_json", "text")
    .addColumn("deployment_address", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("circles_invite_code_idx")
    .ifNotExists()
    .on("circles")
    .column("invite_code")
    .execute();

  await db.schema
    .createIndex("circle_members_circle_idx")
    .ifNotExists()
    .on("circle_members")
    .column("circle_id")
    .execute();

  await db.schema
    .createIndex("proposals_user_status_idx")
    .ifNotExists()
    .on("proposals")
    .columns(["user_id", "status"])
    .execute();

  await db.schema
    .createIndex("strategies_user_status_idx")
    .ifNotExists()
    .on("strategies")
    .columns(["user_id", "status"])
    .execute();
}

export async function down(db: Kysely<DB>): Promise<void> {
  // Drop in reverse order to respect foreign keys
  await db.schema.dropTable("strategies").ifExists().execute();
  await db.schema.dropTable("proposals").ifExists().execute();
  await db.schema.dropTable("circle_members").ifExists().execute();
  await db.schema.dropTable("circles").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
}
