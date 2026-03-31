import { getDatabase } from "../../infrastructure/database/connection.js";
import type { ClaimPage } from "../../infrastructure/database/schema.js";

export const claimService = {
  async create(params: {
    streamId: string;
    senderUserId: number;
    recipientAddress: string;
    tokenAddress: string;
    tokenSymbol: string;
    totalAmount: string;
    amtPerSec: string;
    startTimestamp: number;
    endTimestamp: number;
    title: string;
    subtitle: string;
    chainId: number;
  }): Promise<ClaimPage> {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const result = await db
      .insertInto("claim_pages")
      .values({
        id,
        stream_id: params.streamId,
        sender_user_id: params.senderUserId,
        recipient_address: params.recipientAddress,
        token_address: params.tokenAddress,
        token_symbol: params.tokenSymbol,
        total_amount: params.totalAmount,
        amt_per_sec: params.amtPerSec,
        start_timestamp: params.startTimestamp,
        end_timestamp: params.endTimestamp,
        title: params.title,
        subtitle: params.subtitle,
        chain_id: params.chainId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return result;
  },

  async getById(id: string): Promise<ClaimPage | undefined> {
    const db = getDatabase();
    return db
      .selectFrom("claim_pages")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  },

  async listBySender(userId: number): Promise<ClaimPage[]> {
    const db = getDatabase();
    return db
      .selectFrom("claim_pages")
      .selectAll()
      .where("sender_user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();
  },
};
