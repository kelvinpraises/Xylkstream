import { createServerAdapter } from "@whatwg-node/server";
import { newHttpBatchRpcResponse } from "capnweb";
import { Router } from "express";

import { localhostOnly } from "@/interfaces/rpc/internal/middleware/localhost-only";
import { StorageTarget } from "@/interfaces/rpc/internal/targets/storage-target";
import { LogTarget } from "@/interfaces/rpc/internal/targets/log-target";

async function internalRpcHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  let target;

  switch (true) {
    case pathname.endsWith("/storage"):
      target = new StorageTarget();
      break;
    case pathname.endsWith("/log"):
      target = new LogTarget();
      break;
    default:
      return new Response(JSON.stringify({ error: "Unknown RPC target" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
  }

  try {
    const response = await newHttpBatchRpcResponse(request, target);
    return response;
  } catch (error) {
    console.error("Internal RPC request error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal RPC error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

const rpcAdapter = createServerAdapter(internalRpcHandler);

const router = Router();

// Apply localhost-only middleware to ALL internal routes
router.use(localhostOnly);

router.post("/storage", rpcAdapter);
router.post("/log", rpcAdapter);

export default router;
