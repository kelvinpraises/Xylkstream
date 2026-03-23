/**
 * Binding module for EVM extension.
 * Receives innerBindings from workerd (bytecode + ABI) and constructs the EvmExtension.
 */
import { EvmExtension } from "yieldbox-internal:evm-impl";

interface BindingEnv {
  bytecode: string;
  abi: string;
}

function makeBinding(env: BindingEnv): EvmExtension {
  const abi = JSON.parse(env.abi);
  return new EvmExtension(env.bytecode, abi);
}

export default makeBinding;
