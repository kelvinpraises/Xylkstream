import { buildSync } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

import { PluginProvider } from "@/types/plugin";
import { isIsolatedStoragePermission } from "@/utils/permissions";

const PluginProviderSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1), // Now contains code, not URL
  type: z.enum(["module", "script"]),
  permissions: z.array(z.string()),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Bundle extension file with esbuild
 * @param filename - Extension file to bundle
 * @param bundleDeps - If true, bundles all dependencies (for -impl files with capnweb).
 *                     If false, only strips TypeScript and keeps imports external (for -binding files)
 */
function bundleExtensionFile(filename: string, bundleDeps: boolean): string {
  const filePath = path.join(__dirname, "extensions", filename);

  const result = buildSync({
    entryPoints: [filePath],
    bundle: true, // Always bundle to transpile TypeScript
    format: "esm",
    platform: "browser",
    write: false,
    minify: false,
    loader: { ".ts": "ts" },
    external: bundleDeps ? [] : ["agentix-internal:*"], // Keep agentix-internal imports external for binding files
  });

  const bundledCode = result.outputFiles[0].text;

  // JSON.stringify safely escapes all special characters for Cap'n Proto
  return JSON.stringify(bundledCode).slice(1, -1);
}

async function generateCapnp({
  port,
  provider,
  accountId,
  streamId,
  rpcUrl,
}: {
  port: number;
  provider: PluginProvider;
  accountId: number;
  streamId: number | null;
  rpcUrl: string;
}) {
  const validatedProvider = PluginProviderSchema.parse(provider);

  // Source is now the actual code, not a URL
  const workerSource = validatedProvider.source;
  const escapedWorkerSource = JSON.stringify(workerSource).slice(1, -1);

  const workerConfig =
    validatedProvider.type === "module"
      ? `modules = [( name = "worker", esModule = "${escapedWorkerSource}" )],`
      : `serviceWorkerScript = "${escapedWorkerSource}",`;

  // Generate bindings based on provider permissions
  const bindings: string[] = [];
  const addedBindings = new Set<string>();

  // Check for log::attach permission
  const hasLogPermission = validatedProvider.permissions.includes("log::attach");

  // Determine storage scope from permissions
  const isolatedStoragePerm = validatedProvider.permissions.find(
    isIsolatedStoragePermission,
  );

  // Storage binding (if isolated storage permission exists)
  if (isolatedStoragePerm && !addedBindings.has("storage")) {
    const storageScope = "isolated";
    const innerBindings: string[] = [
      `( name = "rpcService", service = "rpc-server") `,
      `( name = "rpcPath", text = "/rpc/internal/storage") `,
      `( name = "providerId", text = "${validatedProvider.id}") `,
      `( name = "storageScope", text = "${storageScope}") `,
      `( name = "accountId", text = "${accountId}") `,
    ];

    bindings.push(`
    (
      name = "storage",
      wrapped = (
        moduleName = "agentix:storage-binding",
        innerBindings = [
          ${innerBindings.join(",\n          ")}
        ]
      )
    )`);
    addedBindings.add("storage");
  }

  // Log binding (if log::attach permission exists)
  if (hasLogPermission && !addedBindings.has("log")) {
    const innerBindings: string[] = [
      `( name = "rpcService", service = "rpc-server") `,
      `( name = "rpcPath", text = "/rpc/internal/log") `,
      `( name = "accountId", text = "${accountId}") `,
      `( name = "streamId", text = "${streamId ?? ""}") `,
    ];

    bindings.push(`
    (
      name = "log",
      wrapped = (
        moduleName = "agentix:log-binding",
        innerBindings = [
          ${innerBindings.join(",\n          ")}
        ]
      )
    )`);
    addedBindings.add("log");
  }

  const bindingsStr = bindings.length > 0 ? bindings.join(",") : "";

  // Bundle all extension files with esbuild
  // -impl files: bundle dependencies (capnweb)
  const storageImplContent = bundleExtensionFile("storage-impl.ts", true);
  const storageBindingContent = bundleExtensionFile("storage-binding.ts", false);
  const logImplContent = bundleExtensionFile("log-impl.ts", true);
  const logBindingContent = bundleExtensionFile("log-binding.ts", false);

  // Parse RPC URL to get host and port
  const rpcUrlParsed = new URL(rpcUrl);
  const rpcAddress = `${rpcUrlParsed.hostname}:${rpcUrlParsed.port}`;

  const capnp = `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    ( name = "main", worker = .mainWorker ),
    ( name = "rpc-server", external = (address = "${rpcAddress}", http = ()) )
  ],
  sockets = [( name = "http", address = "*:${port}", http = (), service = "main" )],
  extensions = [.agentixExtension]
);

const agentixExtension :Workerd.Extension = (
  modules = [
    ( name = "agentix-internal:storage-impl", esModule = "${storageImplContent}", internal = true ),
    ( name = "agentix:storage-binding", esModule = "${storageBindingContent}", internal = true ),
    ( name = "agentix-internal:log-impl", esModule = "${logImplContent}", internal = true ),
    ( name = "agentix:log-binding", esModule = "${logBindingContent}", internal = true )
  ]
);

const mainWorker :Workerd.Worker = (
  ${workerConfig}
  compatibilityDate = "2025-09-26",
  bindings = [${bindingsStr}
  ]
);
`;
  return capnp;
}

export default generateCapnp;
