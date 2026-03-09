# Xylkstream

**Send money that grows while it travels.**

Stream payments to friends, family, or your team — while every dollar earns rewards automatically on BNB Chain. OpenClaw agents manage your idle capital across DeFi strategies. You set policy. AI maximizes returns.

---

## The Problem

$1T sent via Zelle in 2024. 300M+ P2P users in the US alone. **0% earned while money sits in transit.** Recurring payments, group treasuries, allowances — all idle capital, all earning nothing.

Research backs streaming over lump sums: monthly recipients report better mental health, happiness, and food diversity vs. one-time payouts (Banerjee et al. 2023, GiveDirectly Kenya). Workers with earned wage access saw +11.5% income ($334/mo more). Streaming works.

## How It Works

```
You send payment → Idle capital detected → OpenClaw picks best strategy →
Strategy activated → Money earns → Rewards accumulate → Recipient claims payment + rewards
```

1. **Payments** — Continuous money flows as programmable streams (allowances, payroll, group funds)
2. **Smart Rewards** — Auto-compound, rebalance on drift, risk-score every strategy
3. **Flexible Strategies** — Swap anytime. PancakeSwap V3, Venus, Alpaca — hot-swappable plugins

OpenClaw agents monitor markets 24/7, pick optimal strategies, and execute — with full audit trail and human kill-switch control. AI proposes, humans approve.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                   Client                     │
│        React 19 + TanStack Router            │
│        Privy Auth · Tailwind · SSE           │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                  Server                      │
│     Express · Kysely/Turso · BullMQ/Redis    │
│     MCP · WebSocket Agent Proxy              │
├──────────────┬───────────────┬───────────────┤
│   Agents     │   Streams     │   Plugins     │
│  OpenClaw    │  EVM Deployer │  PancakeSwap  │
│  EigenComp.  │  Stream Ops   │  Venus (soon) │
│  Local Docker│  Yield Mgr    │  Community    │
└──────┬───────┴───────┬───────┴───────────────┘
       │               │
┌──────▼───────────────▼──────────────────────┐
│              Smart Contracts                 │
│                  (BSC)                        │
│                                              │
│   DripsRouter ──▶ FacetA (Streams)           │
│                   FacetB (Splits)             │
│   YieldManager ──▶ IYieldStrategy            │
│                    └─▶ PancakeSwapV3Strategy  │
│   AddressDriver (account abstraction)        │
└──────────────────────────────────────────────┘
```

### Diamond-Style Facet Split

Core contract was 17.6KB — too large for a single deploy. Split into two facets:

| Contract | Role | Size |
|---|---|---|
| `DripsRouter` | Selector-based routing proxy | 789B |
| `DripsFacetA` | Streams, drivers, balances, withdraw | ~13.9KB |
| `DripsFacetB` | Splits, give, collect, setSplits | ~10.4KB |
| `YieldManager` | Capital allocation to strategies | — |
| `PancakeSwapV3Strategy` | Concentrated liquidity on BSC | — |
| `AddressDriver` | User account abstraction | — |

`ManagedProxy → DripsRouter → FacetA/B` via delegatecall. Both facets share storage through identical `_erc1967Slot` names. Shanghai EVM (PUSH0) saves ~211 bytes.

### Plugin System

Any yield strategy implements `IYieldStrategy`. Install, swap, or remove — no contract redeployment.

| Plugin | Status |
|---|---|
| PancakeSwap V3 | Live |
| Venus Protocol | Planned |
| Alpaca Finance | Planned |
| Community strategies | Open |

---

## Stack

### Contracts (`apps/contracts/`)
Foundry · Solidity 0.8.20 · Shanghai EVM · OpenZeppelin

### Server (`apps/server/`)
Express 5 · TypeScript · ESM · Viem · Privy server auth · Kysely + Turso (LibSQL) · BullMQ + Redis · MCP SDK · node-cron

### Client (`apps/client/`)
React 19 · TanStack Router + Query · Privy React auth · Tailwind 4 · Framer Motion · Radix UI · Vite

### Agents
OpenClaw AI agents via EigenCompute (TEE) or local Docker. Verifiable logs with content hashing. WebSocket proxy for real-time browser ↔ agent communication.

---

## Project Structure

```
apps/
├── client/          React frontend
│   └── src/
│       ├── app/         File-based routes (dashboard, streams, studio, claim, etc.)
│       ├── components/  UI components (stream-card, claim-page-editor, csv-batch, etc.)
│       ├── hooks/       Data fetching & state (use-streams, use-account, use-claim, etc.)
│       ├── providers/   Privy, RPC session, theme
│       └── styles/      Tailwind globals
├── server/          Express backend
│   └── src/
│       ├── services/
│       │   ├── agents/      OpenClaw agent orchestration (eigencompute + local)
│       │   ├── streams/     Stream CRUD, EVM deployer, yield management
│       │   ├── plugins/     Plugin discovery (GitHub), registry, WorkerD runtime
│       │   ├── identity/    Auth (Privy/JWT), users, accounts
│       │   ├── wallet/      Wallet creation & management
│       │   └── infra/       Audit logs, notifications, scheduled events
│       ├── infrastructure/
│       │   ├── database/    Turso connection, schema, migrations
│       │   ├── queue/       BullMQ scheduled event processor
│       │   └── cron/        Health checks, balance sync, low-funds monitor
│       └── interfaces/
│           ├── api/         REST routes (streams, device-auth)
│           ├── rpc/         JSON-RPC (auth, sessions, storage)
│           └── mcp/         Model Context Protocol server
├── contracts/       Foundry smart contracts
│   ├── src/             Solidity sources (facets, router, drivers, strategies)
│   ├── test/            Forge tests (15 tests)
│   └── script/          Deploy scripts, e2e tests
├── plugins/         Plugin system (hello-world reference)
└── pitch/           Pitch deck (single-page HTML)
```

---

## BSC Configuration

| Token | Address | Decimals |
|---|---|---|
| USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 |
| BUSD | `0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56` | 18 |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18 |

PancakeSwap V3: NPM `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364` · Factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`

---

## Database

Turso (LibSQL) with Kysely ORM. Core tables:

- **users** — Farcaster-authenticated identities (privy_did, fid, username)
- **vesting_accounts** — 1:1 per user, wallet address + account policy (budgets, yield config, auto-compound, notifications)
- **vesting_streams** — Payment streams with status tracking
- **compute_sessions** — Agent execution state (deploying/running/idle) with verifiable log hashes
- **audit_logs** — Every action logged
- **plugin_registry** — Installed strategies

---

## Running

```bash
# contracts
cd apps/contracts && forge build && forge test

# server
cd apps/server && npm install && npm run dev

# client
cd apps/client && npm install && npm run dev
```

Server runs on port `4848`. Requires `.env` with Privy keys, BSC RPC, Redis URL, and Turso credentials.

---

## Sources

- Zelle Network (2025) — $1T processed in 2024, +27% YoY, 151M accounts
- PayPal/Venmo (2025) — 107.6M active users
- a16z Crypto (2025) — $46T stablecoin volume, 3x Visa
- Banerjee et al. (2023) — GiveDirectly Kenya, streaming vs. lump sum
- Davis (2025) — Earned wage access, +11.5% income
- Acker & Murthy (2020) — 46% of Venmo users prefer it over cash
- Besley, Coate & Loury (1993) — ROSCAs, American Economic Review
- Suri & Jack (2016) — M-PESA lifted 194K households from poverty, Science
- Prelec & Loewenstein (1998) — Streaming reduces pain of paying
- McKinsey (2025) — $2.4T global payments revenue
- World Bank Findex (2021) — Digital payments 35% → 57% in developing economies

---

*BNB Chain Hackathon 2026*
