// Binding module for storage extension
// This receives innerBindings from workerd and constructs the StorageExtension

import { StorageExtension } from "agentix-internal:storage-impl";

interface BindingEnv {
  rpcService: any;
  rpcPath: string;
  portfolioId: string;
  providerId: string;
  storageScope: "isolated";
}

function makeBinding(env: BindingEnv): StorageExtension {
  return new StorageExtension(
    {
      portfolioId: parseInt(env.portfolioId, 10),
      providerId: env.providerId,
      scope: env.storageScope,
    },
    env.rpcService,
    env.rpcPath,
  );
}

export default makeBinding;
