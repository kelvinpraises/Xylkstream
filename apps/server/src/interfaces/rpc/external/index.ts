import { createServerAdapter } from "@whatwg-node/server";
import { newHttpBatchRpcResponse } from "capnweb";
import { Router } from "express";

import { AuthTarget } from "@/interfaces/rpc/external/targets/auth-target";

async function externalRpcHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  let target;

  switch (true) {
    case pathname.endsWith("/auth"):
      target = new AuthTarget();
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
    console.error("External RPC request error:", error);
    return new Response(
      JSON.stringify({
        error: "External RPC error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

const rpcAdapter = createServerAdapter(externalRpcHandler);

const router = Router();

router.post("/auth", rpcAdapter);

export default router;
