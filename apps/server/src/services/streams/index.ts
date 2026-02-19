/**
 * Streams Service
 *
 * Main entry point for stream-related functionality.
 * Re-exports the stream service and chain-specific operations.
 */

export { streamService } from "./stream-service";
export { evmStreamOperations } from "./stream-service";
export type { DeploymentResult } from "./stream-service";

// Chain-specific exports
export {
  evmDeployer,
  evmCalcAccountId,
  evmCalcAmtPerSec,
  packStreamConfig,
  EVM_TOTAL_SPLITS_WEIGHT,
  type DeployedContracts,
  type EVMStreamReceiver,
  type EVMSplitsReceiver,
} from "./chains";
