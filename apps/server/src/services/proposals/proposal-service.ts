import { getDatabase } from "../../infrastructure/database/connection.js";
import type { Proposal } from "../../infrastructure/database/schema.js";

export const proposalService = {
  async create(params: {
    userId: number;
    type: string;
    paramsJson: Record<string, any>;
    agentReason: string | null;
    status?: "pending" | "executed";
  }): Promise<Proposal> {
    const db = getDatabase();
    return await db
      .insertInto("proposals")
      .values({
        user_id: params.userId,
        type: params.type,
        params_json: JSON.stringify(params.paramsJson) as any,
        status: params.status ?? "pending",
        agent_reason: params.agentReason,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async list(
    userId: number,
    status?: string,
  ): Promise<Proposal[]> {
    const db = getDatabase();
    let query = db
      .selectFrom("proposals")
      .selectAll()
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc");

    if (status) {
      query = query.where(
        "status",
        "=",
        status as Proposal["status"],
      );
    }

    return await query.execute();
  },

  async getById(proposalId: number, userId: number): Promise<Proposal | undefined> {
    const db = getDatabase();
    return await db
      .selectFrom("proposals")
      .selectAll()
      .where("id", "=", proposalId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
  },

  async updateStatus(
    proposalId: number,
    userId: number,
    status: "approved" | "rejected" | "executed",
  ): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .updateTable("proposals")
      .set({
        status,
        ...(status === "executed" ? { executed_at: new Date().toISOString() } : {}),
      })
      .where("id", "=", proposalId)
      .where("user_id", "=", userId)
      .execute();

    return result.length > 0 && Number(result[0].numUpdatedRows) > 0;
  },

  async countPending(userId: number): Promise<number> {
    const db = getDatabase();
    const result = await db
      .selectFrom("proposals")
      .where("user_id", "=", userId)
      .where("status", "=", "pending")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  },
};
