import { getDatabase } from "../../infrastructure/database/connection.js";
import type { Circle, CircleMember } from "../../infrastructure/database/schema.js";

export const circleService = {
  async create(params: {
    ownerUserId: number;
    name: string;
    inviteCode: string;
    encryptionPubkey: string;
  }): Promise<Circle> {
    const db = getDatabase();
    const result = await db
      .insertInto("circles")
      .values({
        owner_user_id: params.ownerUserId,
        name: params.name,
        invite_code: params.inviteCode,
        encryption_pubkey: params.encryptionPubkey,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return result;
  },

  async listByOwner(userId: number): Promise<(Circle & { member_count: number })[]> {
    const db = getDatabase();
    const circles = await db
      .selectFrom("circles")
      .selectAll("circles")
      .where("owner_user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();

    const result = [];
    for (const circle of circles) {
      const count = await db
        .selectFrom("circle_members")
        .where("circle_id", "=", circle.id)
        .select(db.fn.countAll().as("count"))
        .executeTakeFirst();
      result.push({ ...circle, member_count: Number(count?.count ?? 0) });
    }
    return result;
  },

  async getById(
    circleId: number,
    userId: number,
  ): Promise<{ circle: Circle; members: CircleMember[] } | null> {
    const db = getDatabase();
    const circle = await db
      .selectFrom("circles")
      .selectAll()
      .where("id", "=", circleId)
      .where("owner_user_id", "=", userId)
      .executeTakeFirst();

    if (!circle) return null;

    const members = await db
      .selectFrom("circle_members")
      .selectAll()
      .where("circle_id", "=", circleId)
      .orderBy("joined_at", "desc")
      .execute();

    return { circle, members };
  },

  async validateInviteCode(
    inviteCode: string,
  ): Promise<{ circleId: number; name: string; encryptionPubkey: string } | null> {
    const db = getDatabase();
    const circle = await db
      .selectFrom("circles")
      .select(["id", "name", "encryption_pubkey"])
      .where("invite_code", "=", inviteCode)
      .executeTakeFirst();

    if (!circle) return null;
    return { circleId: circle.id, name: circle.name, encryptionPubkey: circle.encryption_pubkey };
  },

  async join(params: {
    circleId: number;
    userId: number;
    encryptedStealthAddress: string;
    ephemeralPubkey: string;
  }): Promise<CircleMember> {
    const db = getDatabase();

    const existing = await db
      .selectFrom("circle_members")
      .selectAll()
      .where("circle_id", "=", params.circleId)
      .where("user_id", "=", params.userId)
      .executeTakeFirst();

    if (existing) return existing;

    return await db
      .insertInto("circle_members")
      .values({
        circle_id: params.circleId,
        user_id: params.userId,
        encrypted_stealth_address: params.encryptedStealthAddress,
        ephemeral_pubkey: params.ephemeralPubkey,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async updateMemberStatus(
    circleId: number,
    memberId: number,
    status: "pending" | "approved" | "rejected",
    ownerUserId: number,
  ): Promise<boolean> {
    const db = getDatabase();
    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("id", "=", circleId)
      .where("owner_user_id", "=", ownerUserId)
      .executeTakeFirst();
    if (!circle) return false;

    const result = await db
      .updateTable("circle_members")
      .set({ status })
      .where("id", "=", memberId)
      .where("circle_id", "=", circleId)
      .execute();
    return result.length > 0 && Number(result[0].numUpdatedRows) > 0;
  },

  async updateName(circleId: number, name: string, ownerUserId: number): Promise<boolean> {
    const db = getDatabase();
    const result = await db
      .updateTable("circles")
      .set({ name })
      .where("id", "=", circleId)
      .where("owner_user_id", "=", ownerUserId)
      .execute();
    return result.length > 0 && Number(result[0].numUpdatedRows) > 0;
  },

  async removeMember(circleId: number, memberId: number, ownerUserId: number): Promise<boolean> {
    const db = getDatabase();

    const circle = await db
      .selectFrom("circles")
      .select("id")
      .where("id", "=", circleId)
      .where("owner_user_id", "=", ownerUserId)
      .executeTakeFirst();

    if (!circle) return false;

    const result = await db
      .deleteFrom("circle_members")
      .where("id", "=", memberId)
      .where("circle_id", "=", circleId)
      .execute();

    return result.length > 0 && Number(result[0].numDeletedRows) > 0;
  },
};
