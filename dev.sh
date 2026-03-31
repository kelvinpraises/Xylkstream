#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Colors
G='\033[0;32m' Y='\033[0;33m' R='\033[0;31m' N='\033[0m'
log() { echo -e "${G}→${N} $1"; }
warn() { echo -e "${Y}!${N} $1"; }
err() { echo -e "${R}✗${N} $1"; }

cleanup() {
  log "Shutting down..."
  pkill -f "anvil --block-time" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$CLIENT_PID" ] && kill "$CLIENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── 1. Kill stale processes ──
log "Killing stale processes..."
pkill -9 -f "anvil" 2>/dev/null || true
pkill -9 -f "tsx watch src/server.ts" 2>/dev/null || true
lsof -ti:4848 | xargs kill -9 2>/dev/null || true
sleep 1

# ── 2. Start Anvil ──
log "Starting Anvil (block-time 5)..."
anvil --block-time 5 > /tmp/anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for anvil to be ready
for i in $(seq 1 10); do
  if cast block-number --rpc-url http://127.0.0.1:8545 &>/dev/null; then
    break
  fi
  sleep 1
done

if ! cast block-number --rpc-url http://127.0.0.1:8545 &>/dev/null; then
  err "Anvil failed to start. Check /tmp/anvil.log"
  exit 1
fi
log "Anvil running (PID $ANVIL_PID)"

# ── 3. Read operator key (single key for deploy + bundle + paymaster) ──
OPERATOR_KEY=$(grep '^OPERATOR_KEY=' "$ROOT/apps/server/.env" | cut -d= -f2)
OPERATOR_ADDRESS=$(grep '^OPERATOR_ADDRESS=' "$ROOT/apps/server/.env" | cut -d= -f2)
if [ -z "$OPERATOR_KEY" ] || [ -z "$OPERATOR_ADDRESS" ]; then
  err "OPERATOR_KEY and OPERATOR_ADDRESS must be set in apps/server/.env"
  err "This single key is used for deploying, bundling, and paymaster signing."
  exit 1
fi

# Fund operator from Anvil account #0 so it can deploy + run bundler
log "Funding operator ($OPERATOR_ADDRESS) with 100 ETH..."
cast send "$OPERATOR_ADDRESS" \
  --value 100ether \
  --private-key "$ANVIL_KEY" \
  --rpc-url http://127.0.0.1:8545 \
  > /dev/null 2>&1
log "Operator funded"

# ── 4. Deploy contracts (same key as prod → same CREATE2 addresses) ──
log "Deploying contracts (force)..."
cd "$ROOT/apps/contracts"
DEPLOYER_PRIVATE_KEY="$OPERATOR_KEY" OPERATOR_ADDRESS="$OPERATOR_ADDRESS" npm run deploy -- --name localhost --force 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

if [ $? -ne 0 ]; then
  err "Contract deployment failed"
  exit 1
fi
log "Contracts deployed"

# ── 5. Start server ──
log "Starting server..."
cd "$ROOT/apps/server"
npm run dev > /tmp/xylk-server.log 2>&1 &
SERVER_PID=$!
sleep 3

if kill -0 "$SERVER_PID" 2>/dev/null; then
  log "Server running (PID $SERVER_PID) — http://localhost:4848"
else
  err "Server failed to start. Check /tmp/xylk-server.log"
  exit 1
fi

# ── 6. Start client ──
log "Starting client..."
cd "$ROOT/apps/client"
npm run dev > /tmp/xylk-client.log 2>&1 &
CLIENT_PID=$!
sleep 2

if kill -0 "$CLIENT_PID" 2>/dev/null; then
  log "Client running (PID $CLIENT_PID) — http://localhost:5173"
else
  err "Client failed to start. Check /tmp/xylk-client.log"
  exit 1
fi

# ── Done ──
echo ""
echo -e "${G}✓ Everything running${N}"
echo "  Anvil   → http://127.0.0.1:8545 (block-time 5)"
echo "  Server  → http://localhost:4848"
echo "  Client  → http://localhost:5173"
echo "  Operator → $OPERATOR_ADDRESS (100 ETH)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep alive and tail logs
wait
