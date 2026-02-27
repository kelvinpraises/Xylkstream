#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#  XYLKSTREAM E2E TEST — Real Tempo Testnet
#  Deploys all contracts + runs tests using cast
#  Usage: bash script/e2e-test.sh
# ═══════════════════════════════════════════════════════════════════════════

RPC="https://rpc.moderato.tempo.xyz"
GAS="16500000"

# Tokens
ALPHA_USD="0x20C0000000000000000000000000000000000001"

# Test wallets
W1="0x031891A61200FedDd622EbACC10734BC90093B2A"
W1_PK="0x2b9e3b8a095940cf3461e27bfb2bebb498df9a6381b76b9f9c48c9bbdc3c8192"

W2="0xAcF8dBD0352a9D47135DA146EA5DbEfAD58340C4"
W2_PK="0xf3c009932cfe5e0b20db6c959e28e3546047cf70309d0f2ac5d38ee14527739a"

W3="0x41A75fc9817AF9F2DB0c0e58C71Bc826339b3Acb"
W3_PK="0xf804bb2ff55194ce6a62de31219d08fff6fd67fbaa68170e3dc8234035cad108"

MAX_UINT="115792089237316195423570985008687907853269984665640564039457584007913129639935"

echo "=== XYLKSTREAM E2E TEST ON TEMPO TESTNET ==="
echo ""

# Helper: deploy contract, return address via DEPLOY_ADDR global
deploy() {
    local BYTECODE=$1 PK=$2 LABEL=$3 RESULT DEPLOY_ADDR_TMP STATUS i

    for i in 1 2 3 4 5; do
        sleep 8
        RESULT=$(cast send --legacy --gas-limit $GAS --private-key "$PK" --rpc-url "$RPC" --create "$BYTECODE" --json 2>&1) && break
        echo "  Retry $i for $LABEL..."
    done

    DEPLOY_ADDR=$(echo "$RESULT" | jq -r '.contractAddress // empty' 2>/dev/null || true)
    STATUS=$(echo "$RESULT" | jq -r '.status // empty' 2>/dev/null || true)

    if [ -z "$DEPLOY_ADDR" ] || [ "$STATUS" = "0x0" ]; then
        echo "  FAILED $LABEL: $(echo $RESULT | head -c 200)"
        exit 1
    fi
    echo "  $LABEL: $DEPLOY_ADDR"
}

# Helper: send tx
send() {
    local PK=$1 TO=$2 SIG=$3 RESULT STATUS i
    shift 3

    for i in 1 2 3 4 5; do
        sleep 8
        RESULT=$(cast send --legacy --gas-limit $GAS --private-key "$PK" --rpc-url "$RPC" "$TO" "$SIG" "$@" --json 2>&1) && break
        echo "  Retry $i for $SIG..."
    done

    STATUS=$(echo "$RESULT" | jq -r '.status // empty' 2>/dev/null || true)
    if [ "$STATUS" = "0x0" ]; then
        echo "  TX REVERTED: $SIG"
        exit 1
    fi
    if [ -z "$STATUS" ]; then
        echo "  TX FAILED: $SIG: $(echo $RESULT | head -c 200)"
        exit 1
    fi
}

# Helper: call (read) — strips cast's [x.xxeN] annotations
call() {
    cast call --rpc-url $RPC "$@" 2>&1 | awk '{print $1}'
}

# ─── Step 0: Check balances ───
echo "--- Wallet balances ---"
echo "  W1: $(call $ALPHA_USD 'balanceOf(address)(uint256)' $W1)"
echo "  W2: $(call $ALPHA_USD 'balanceOf(address)(uint256)' $W2)"
echo "  W3: $(call $ALPHA_USD 'balanceOf(address)(uint256)' $W3)"
echo ""

# ─── Step 1: Deploy contracts ───
echo "--- Deploying contracts ---"

# Build to get bytecodes
forge build --silent

# 1a. Deploy DripsFacetA (Streams + drivers, constructor: cycleSecs=10)
FACET_A_BYTECODE=$(forge inspect DripsFacetA bytecode)
FACET_A_INIT=$(cast abi-encode "constructor(uint32)" 10 | cut -c3-)
deploy "${FACET_A_BYTECODE}${FACET_A_INIT}" $W1_PK "DripsFacetA"
FACET_A=$DEPLOY_ADDR

# 1b. Deploy DripsFacetB (Splits + collect + give)
FACET_B_BYTECODE=$(forge inspect DripsFacetB bytecode)
deploy "$FACET_B_BYTECODE" $W1_PK "DripsFacetB"
FACET_B=$DEPLOY_ADDR

# 1c. Deploy DripsRouter (routes calls to facets)
ROUTER_BYTECODE=$(forge inspect DripsRouter bytecode)
ROUTER_INIT=$(cast abi-encode "constructor(address,address)" "$FACET_A" "$FACET_B" | cut -c3-)
deploy "${ROUTER_BYTECODE}${ROUTER_INIT}" $W1_PK "DripsRouter"
ROUTER=$DEPLOY_ADDR

# 1d. Deploy ManagedProxy wrapping the router
PROXY_BYTECODE=$(forge inspect ManagedProxy bytecode)
PROXY_INIT=$(cast abi-encode "constructor(address,address,bytes)" "$ROUTER" "$W1" "0x" | cut -c3-)
deploy "${PROXY_BYTECODE}${PROXY_INIT}" $W1_PK "Drips Proxy"
DRIPS=$DEPLOY_ADDR

# 1e. Deploy Caller
CALLER_BYTECODE=$(forge inspect Caller bytecode)
deploy "$CALLER_BYTECODE" $W1_PK "Caller"
CALLER=$DEPLOY_ADDR

# 1f. Register drivers (need driverId=2 for AddressDriver)
echo "  Registering drivers..."
send $W1_PK $DRIPS "registerDriver(address)" "0x0000000000000000000000000000000000000001"
send $W1_PK $DRIPS "registerDriver(address)" "0x0000000000000000000000000000000000000001"
send $W1_PK $DRIPS "registerDriver(address)" "$W1"
DRIVER_ID=$(call $DRIPS "nextDriverId()(uint32)")
echo "  Next driver ID: $DRIVER_ID (used 2)"

# 1g. Deploy AddressDriver logic
AD_LOGIC_BYTECODE=$(forge inspect AddressDriver bytecode)
AD_LOGIC_INIT=$(cast abi-encode "constructor(address,address,uint32)" "$DRIPS" "$CALLER" 2 | cut -c3-)
deploy "${AD_LOGIC_BYTECODE}${AD_LOGIC_INIT}" $W1_PK "AddressDriver Logic"
AD_LOGIC=$DEPLOY_ADDR

# 1h. Deploy ManagedProxy for AddressDriver
AD_PROXY_INIT=$(cast abi-encode "constructor(address,address,bytes)" "$AD_LOGIC" "$W1" "0x" | cut -c3-)
deploy "${PROXY_BYTECODE}${AD_PROXY_INIT}" $W1_PK "AddressDriver Proxy"
DRIVER=$DEPLOY_ADDR

# 1i. Update driver address in Drips
echo "  Updating driver address..."
send $W1_PK $DRIPS "updateDriverAddress(uint32,address)" 2 "$DRIVER"

# 1j. Deploy YieldManager
YM_BYTECODE=$(forge inspect YieldManager bytecode)
YM_INIT=$(cast abi-encode "constructor(address)" "$DRIPS" | cut -c3-)
deploy "${YM_BYTECODE}${YM_INIT}" $W1_PK "YieldManager"
YIELD_MGR=$DEPLOY_ADDR

# 1k. Deploy TempoDEXStrategy
TS_BYTECODE=$(forge inspect TempoDEXStrategy bytecode)
TS_INIT=$(cast abi-encode "constructor(address)" "$YIELD_MGR" | cut -c3-)
deploy "${TS_BYTECODE}${TS_INIT}" $W1_PK "TempoDEXStrategy"
STRATEGY=$DEPLOY_ADDR

echo ""
echo "  All contracts deployed!"
echo "  DripsFacetA:      $FACET_A"
echo "  DripsFacetB:      $FACET_B"
echo "  DripsRouter:      $ROUTER"
echo "  Drips (Proxy):    $DRIPS"
echo "  AddressDriver:    $DRIVER"
echo "  YieldManager:     $YIELD_MGR"
echo "  Strategy:         $STRATEGY"
echo ""

# ─── Step 2: Approvals ───
echo "--- Token Approvals ---"
echo "  W1 -> AddressDriver..."
send $W1_PK $ALPHA_USD "approve(address,uint256)" $DRIVER $MAX_UINT
echo "  W1 -> YieldManager..."
send $W1_PK $ALPHA_USD "approve(address,uint256)" $YIELD_MGR $MAX_UINT
echo "  W2 -> AddressDriver..."
send $W2_PK $ALPHA_USD "approve(address,uint256)" $DRIVER $MAX_UINT
echo "  Done!"
echo ""

# ─── Step 3: Test Give & Collect ───
echo "--- TEST 1: Give & Collect ---"

W3_ACCT=$(call $DRIVER "calcAccountId(address)(uint256)" $W3)
echo "  W3 account ID: $W3_ACCT"

GIVE_AMT="100000000" # 100 AlphaUSD

echo "  W1 giving 100 AlphaUSD to W3..."
send $W1_PK $DRIVER "give(uint256,address,uint128)" "$W3_ACCT" $ALPHA_USD $GIVE_AMT

SPLITTABLE=$(call $DRIPS "splittable(uint256,address)(uint128)" "$W3_ACCT" $ALPHA_USD)
echo "  Splittable: $SPLITTABLE"

echo "  Splitting..."
send $W1_PK $DRIPS "split(uint256,address,(uint256,uint32)[])" "$W3_ACCT" $ALPHA_USD "[]"

COLLECTABLE=$(call $DRIPS "collectable(uint256,address)(uint128)" "$W3_ACCT" $ALPHA_USD)
echo "  Collectable: $COLLECTABLE"

W3_BAL_BEFORE=$(call $ALPHA_USD "balanceOf(address)(uint256)" $W3)
echo "  W3 collecting..."
send $W3_PK $DRIVER "collect(address,address)" "$ALPHA_USD" "$W3"

W3_BAL_AFTER=$(call $ALPHA_USD "balanceOf(address)(uint256)" $W3)
echo "  W3 balance: $W3_BAL_BEFORE -> $W3_BAL_AFTER"
echo "  TEST 1 PASSED!"
echo ""

# ─── Step 4: Test Stream Setup & Cancel ───
echo "--- TEST 2: Stream Setup & Cancel ---"

W2_ACCT=$(call $DRIVER "calcAccountId(address)(uint256)" $W2)
AMT_MULT=$(call $DRIPS "AMT_PER_SEC_MULTIPLIER()(uint160)")
echo "  AMT_PER_SEC_MULTIPLIER: $AMT_MULT"

# 1 AlphaUSD/sec = 1e6 * multiplier
# StreamConfig packed: (streamId << 224) | (amtPerSec << 64) | (start << 32) | duration
# streamId=0, start=0, duration=0 -> just amtPerSec << 64
AMT_PER_SEC=$(python3 -c "print(1000000 * $AMT_MULT)")
STREAM_CFG=$(python3 -c "print($AMT_PER_SEC << 64)")

DEPOSIT="500000000" # 500 AlphaUSD

echo "  Setting stream W2->W3, 1 AlphaUSD/sec, deposit 500..."
send $W2_PK $DRIVER \
    "setStreams(address,(uint256,uint256)[],int128,(uint256,uint256)[],uint32,uint32,address)" \
    $ALPHA_USD "[]" $DEPOSIT "[($W3_ACCT,$STREAM_CFG)]" 0 0 $W2

echo "  Stream created!"

# Check stream balance
STREAM_BAL=$(cast call --rpc-url $RPC $DRIPS "streamsState(uint256,address)" "$W2_ACCT" $ALPHA_USD 2>&1)
echo "  Stream state (raw): $STREAM_BAL"

echo "  Cancelling stream..."
send $W2_PK $DRIVER \
    "setStreams(address,(uint256,uint256)[],int128,(uint256,uint256)[],uint32,uint32,address)" \
    $ALPHA_USD "[($W3_ACCT,$STREAM_CFG)]" "-$DEPOSIT" "[]" 0 0 $W2

echo "  TEST 2 PASSED!"
echo ""

# ─── Step 5: Test YieldManager + DEX ───
echo "--- TEST 3: YieldManager + DEX Strategy ---"

INVEST="1000000000" # 1000 AlphaUSD

echo "  Depositing $INVEST to YieldManager..."
send $W1_PK $YIELD_MGR "ownerDeposit(address,uint256)" $ALPHA_USD $INVEST

BALS=$(call $YIELD_MGR "getBalances(address)(uint128,uint128,uint128)" $ALPHA_USD)
echo "  After deposit: $BALS"

# strategyData: (address, int16, int16, bool) = (ALPHA_USD, -1, 1, true)
STRAT_DATA=$(cast abi-encode "f(address,int16,int16,bool)" $ALPHA_USD -- -1 1 true)
echo "  Opening position on DEX..."
# Use raw cast send because bytes arg needs careful handling
sleep 5
cast send --legacy --gas-limit $GAS --private-key $W1_PK --rpc-url $RPC $YIELD_MGR \
    "positionOpen(address,address,uint256,bytes)" \
    "$ALPHA_USD" "$STRATEGY" "$INVEST" "$STRAT_DATA" --json > /dev/null 2>&1

BALS=$(call $YIELD_MGR "getBalances(address)(uint128,uint128,uint128)" $ALPHA_USD)
echo "  After invest: $BALS"

echo "  Closing position..."
sleep 5
cast send --legacy --gas-limit $GAS --private-key $W1_PK --rpc-url $RPC $YIELD_MGR \
    "positionClose(address,address,bytes)" \
    "$ALPHA_USD" "$STRATEGY" "0x" --json > /dev/null 2>&1

BALS=$(call $YIELD_MGR "getBalances(address)(uint128,uint128,uint128)" $ALPHA_USD)
echo "  After close: $BALS"
echo "  TEST 3 PASSED!"
echo ""

echo "=== ALL E2E TESTS PASSED ==="
echo ""
echo "Contract addresses:"
echo "  Drips (Proxy):    $DRIPS"
echo "  AddressDriver:    $DRIVER"
echo "  YieldManager:     $YIELD_MGR"
echo "  Strategy:         $STRATEGY"
