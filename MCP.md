# MCP Agent API

Streamable HTTP endpoint at `POST /mcp`. Authenticated via `Authorization: Bearer <agent-token>`.

---

## YieldBox

Agent-driven Solidity strategy compilation, testing, and deployment.

### `submit_strategy`

Submit Solidity source code for compilation.

**Params:**
| Field | Type | Description |
|---|---|---|
| `name` | `string` | Strategy name (e.g., PancakeV3Optimizer) |
| `sourceCode` | `string` | Complete Solidity source code |

**Returns:** `{ strategyId: number, status: "pending" }`

Compilation happens in-process (solc-js) and is fire-and-forget. Poll with `get_strategy_results`.

### `get_strategy_results`

Get compilation and test results for a strategy.

**Params:**
| Field | Type | Description |
|---|---|---|
| `strategyId` | `number` | Strategy ID from `submit_strategy` |

**Returns:**
```json
{
  "id": 1,
  "name": "PancakeV3Optimizer",
  "status": "pending | compiling | compiled | failed",
  "bytecode": "6080...",
  "abi": [],
  "errors": null,
  "testStatus": "untested | testing | passed | failed",
  "testResults": {
    "pass": true,
    "deploy": { "address": "0x...", "gasUsed": 84333 },
    "calls": [{ "fn": "add(3,7)", "success": true, "result": "10", "gasUsed": 926 }],
    "totalGas": 85259
  },
  "deploymentAddress": null
}
```

### `test_strategy`

Run EVM tests on a compiled strategy in a sandboxed workerd environment.

**Params:**
| Field | Type | Description |
|---|---|---|
| `strategyId` | `number` | Strategy ID (must be compiled) |
| `testScript` | `string?` | Custom worker entry script. If omitted, auto-generates tests for all view/pure functions. |

**Returns:** `{ strategyId, testStatus, testResults }`

The custom `testScript` is a standard ES module worker entry with access to `env.evm`:

```js
export default {
  async fetch(request, env) {
    const deploy = await env.evm.deploy();
    const result = await env.evm.call("myFunction", [arg1, arg2]);
    return Response.json({ pass: true, deploy, result });
  }
};
```

`env.evm` provides:
- `deploy(opts?)` — deploy the contract, returns `{ success, address, gasUsed, revert }`
- `call(functionName, args?, opts?)` — call a contract function, returns `{ success, result, gasUsed, revert }`
- `getAbi()` — returns the contract ABI
- `getFunctions()` — returns function names

### Typical flow

1. `submit_strategy` with Solidity code
2. Poll `get_strategy_results` until `status === "compiled"`
3. `test_strategy` (optionally with custom test script)
4. If tests pass, `propose_deploy_strategy` to request user approval
