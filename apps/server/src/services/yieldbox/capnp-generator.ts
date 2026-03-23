import { buildSync } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bundle an extension file with esbuild.
 * - impl files: bundleDeps=true → bundles @ethereumjs/vm, viem, etc.
 * - binding files: bundleDeps=false → keeps yieldbox-internal:* imports external
 */
function bundleExtensionFile(filename: string, bundleDeps: boolean): string {
  const filePath = path.join(__dirname, "extensions", filename);

  const result = buildSync({
    entryPoints: [filePath],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    minify: true,
    loader: { ".ts": "ts" },
    external: bundleDeps ? [] : ["yieldbox-internal:*"],
    define: bundleDeps ? { "process.env.DEBUG": '""', "process.env": "{}" } : {},
  });

  return JSON.stringify(result.outputFiles[0].text).slice(1, -1);
}

/**
 * Generate capnp config for EVM testing in workerd sandbox.
 *
 * The worker entry is the agent's test script — a standard ES module:
 *   export default {
 *     async fetch(request, env) {
 *       const deploy = await env.evm.deploy();
 *       const result = await env.evm.call("myFunction", [arg1, arg2]);
 *       return Response.json({ deploy, result });
 *     }
 *   };
 *
 * env.evm is injected via wrapped binding → evm-binding constructs EvmExtension
 * from innerBindings (bytecode + abi).
 */
export function generateCapnp({
  port,
  workerScript,
  bytecode,
  abi,
}: {
  port: number;
  workerScript: string;
  bytecode: string;
  abi: any[];
}): string {
  const escapedWorkerScript = JSON.stringify(workerScript).slice(1, -1);
  const escapedBytecode = JSON.stringify(bytecode).slice(1, -1);
  const escapedAbi = JSON.stringify(JSON.stringify(abi)).slice(1, -1);

  const evmImplContent = bundleExtensionFile("evm-impl.ts", true);
  const evmBindingContent = bundleExtensionFile("evm-binding.ts", false);

  return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    ( name = "main", worker = .mainWorker )
  ],
  sockets = [( name = "http", address = "*:${port}", http = (), service = "main" )],
  extensions = [.yieldboxExtension]
);

const yieldboxExtension :Workerd.Extension = (
  modules = [
    ( name = "yieldbox-internal:evm-impl", esModule = "${evmImplContent}", internal = true ),
    ( name = "yieldbox:evm-binding", esModule = "${evmBindingContent}", internal = true )
  ]
);

const mainWorker :Workerd.Worker = (
  modules = [
    ( name = "worker", esModule = "${escapedWorkerScript}" )
  ],
  compatibilityDate = "2024-01-01",
  bindings = [
    (
      name = "evm",
      wrapped = (
        moduleName = "yieldbox:evm-binding",
        innerBindings = [
          ( name = "bytecode", text = "${escapedBytecode}" ),
          ( name = "abi", text = "${escapedAbi}" )
        ]
      )
    )
  ]
);
`;
}
