// Lightweight MCP Server Implementation for hello-world skill
// Works in workerd/Cloudflare Workers without Node.js dependencies

interface MCPRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// Tool definitions
const tools = [
  {
    name: "sayHello",
    description: "Returns a personalized greeting",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name to greet" },
      },
      required: ["name"],
    },
  },
  {
    name: "saveGreeting",
    description: "Save a greeting to isolated storage",
    inputSchema: {
      type: "object",
      properties: {
        greeting: { type: "string", description: "Greeting text to save" },
      },
      required: ["greeting"],
    },
  },
  {
    name: "getGreeting",
    description: "Retrieve saved greeting from isolated storage",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];


// Handle MCP requests
async function handleMCPRequest(request: MCPRequest, env: any): Promise<MCPResponse> {
  const { method, params, id } = request;

  try {
    // Initialize
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "hello-world",
            version: "1.0.0",
          },
        },
      };
    }

    // List tools
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools },
      };
    }

    // Call tool
    if (method === "tools/call") {
      const { name, arguments: args } = params;

      if (name === "sayHello") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Hello, ${args.name}! 👋 This is the hello-world skill.`,
              },
            ],
          },
        };
      }

      if (name === "saveGreeting") {
        if (env?.storage) {
          await env.storage.set(args.greeting);
        }

        if (env?.log) {
          await env.log.attach({
            type: "ui",
            title: "Greeting Saved",
            summary: `Stored: "${args.greeting}"`,
            url: "/ui/greeting-card.html",
            data: { greeting: args.greeting, timestamp: Date.now() },
          });
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Greeting saved to isolated storage: "${args.greeting}"`,
              },
            ],
          },
        };
      }

      if (name === "getGreeting") {
        let greeting = "No greeting saved yet";
        if (env?.storage) {
          greeting = (await env.storage.get()) || greeting;
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: greeting,
              },
            ],
          },
        };
      }

      return {
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`,
        },
      };
    }

    // Unknown method
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  } catch (error: any) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error.message || "Internal error",
      },
    };
  }
}

// SSE implementation for MCP
class MCPSSEHandler {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController | null = null;

  constructor(private env: any) {}

  async handleSSE(request: Request): Promise<Response> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Set up SSE stream
    const stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
    });

    // Handle incoming messages via POST to /mcp/messages
    // For now, return the SSE stream
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  async handleMessage(request: Request): Promise<Response> {
    try {
      const mcpRequest = (await request.json()) as MCPRequest;
      const response = await handleMCPRequest(mcpRequest, this.env);

      // Send via SSE if controller exists, otherwise return JSON
      if (this.controller) {
        const data = `data: ${JSON.stringify(response)}\n\n`;
        this.controller.enqueue(this.encoder.encode(data));
        return new Response("OK", { status: 200 });
      }

      return Response.json(response);
    } catch (error: any) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: error.message,
          },
        },
        { status: 400 },
      );
    }
  }
}

// Export as Cloudflare Worker / workerd compatible
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const handler = new MCPSSEHandler(env);

    // SSE endpoint
    if (url.pathname === "/mcp/sse" && request.method === "GET") {
      return handler.handleSSE(request);
    }

    // Message endpoint
    if (url.pathname === "/mcp/messages" && request.method === "POST") {
      return handler.handleMessage(request);
    }

    // Direct JSON-RPC endpoint (for testing)
    if (url.pathname === "/mcp" && request.method === "POST") {
      try {
        const mcpRequest = (await request.json()) as MCPRequest;
        const response = await handleMCPRequest(mcpRequest, env);
        return Response.json(response);
      } catch (error: any) {
        return Response.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32700,
              message: "Parse error",
              data: error.message,
            },
          },
          { status: 400 },
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
