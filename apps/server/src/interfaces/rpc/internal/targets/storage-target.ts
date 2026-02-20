import { RpcTarget } from "capnweb";

import { pluginStorageService } from "@/services/plugins/plugin-storage-service";

/**
 * Storage RPC Target (Internal)
 * Provides plugin isolated storage access via Cap'n Web RPC
 */
export class StorageTarget extends RpcTarget {
  async getIsolatedStorage(config: {
    accountId: number;
    providerId: string;
  }): Promise<any | null> {
    console.log("[StorageTarget] getIsolatedStorage called:", config);
    return await pluginStorageService.getIsolatedStorage(
      config.accountId,
      config.providerId,
    );
  }

  async setIsolatedStorage(config: {
    accountId: number;
    providerId: string;
    data: any;
  }): Promise<void> {
    console.log("[StorageTarget] setIsolatedStorage called:", config);
    await pluginStorageService.setIsolatedStorage(
      config.accountId,
      config.providerId,
      config.data,
    );
  }

  async deleteIsolatedStorage(config: {
    accountId: number;
    providerId: string;
  }): Promise<void> {
    console.log("[StorageTarget] deleteIsolatedStorage called:", config);
    await pluginStorageService.deleteIsolatedStorage(config.accountId, config.providerId);
  }
}
