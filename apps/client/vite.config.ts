import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

import { resolve } from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      routesDirectory: "./src/app",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    viteReact(),
    tailwindcss(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "assert", "process", "util", "events"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
      overrides: {
        fs: "empty",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "sodium-javascript": resolve(__dirname, "node_modules/sodium-javascript"),
      "vite-plugin-node-polyfills/shims/buffer": resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/buffer"),
      "vite-plugin-node-polyfills/shims/global": resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/global"),
      "vite-plugin-node-polyfills/shims/process": resolve(__dirname, "node_modules/vite-plugin-node-polyfills/shims/process"),
    },
  },
  optimizeDeps: {
    exclude: ["snarkjs"],
    include: ["@xylkstream/wdk-4337"],
  },
});
