// Binding module for log extension
// This receives innerBindings from workerd and constructs the LogExtension

import { LogExtension } from "agentix-internal:log-impl";

interface BindingEnv {
  rpcService: any;
  rpcPath: string;
  portfolioId: string;
  bountyActionId: string;
}

function makeBinding(env: BindingEnv): LogExtension {
  return new LogExtension(
    env.rpcService,
    env.rpcPath,
    parseInt(env.portfolioId, 10),
    parseInt(env.bountyActionId, 10),
  );
}

export default makeBinding;
