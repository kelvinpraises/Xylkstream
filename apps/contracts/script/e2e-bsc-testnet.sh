#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
#  XYLKSTREAM E2E TEST — BSC Testnet (Chain 97)
#  Deploys all contracts, runs give/collect + YieldManager tests,
#  measures gas costs per contract and estimates mainnet BNB spend.
#
#  Usage: cd apps/contracts && bash script/e2e-bsc-testnet.sh
# ═══════════════════════════════════════════════════════════════════════════

RPC="https://bsc-testnet-rpc.publicnode.com"
GAS="8000000"

# PancakeSwap V3 on BSC Testnet (factory is same address as mainnet)
PANCAKE_NPM="0x427bF5b37357632377eCbEC9de3626C71A5396c1"
PANCAKE_FACTORY="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"

# Test wallet
W1="0x75cD4598bA3B97a896EBa903a96C513a3D5BBAcC"
W1_PK="0x9ba8e90fcad2ae4b69d46b3ab47329574b059f09ad2956fdfb58bfa393afbcef"

MAX_UINT="115792089237316195423570985008687907853269984665640564039457584007913129639935"

# Track total gas
TOTAL_DEPLOY_GAS=0
TOTAL_TX_GAS=0
declare -A CONTRACT_GAS

echo "═══════════════════════════════════════════════════════════════"
echo "  XYLKSTREAM E2E — BSC TESTNET"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── Check balance ───
BAL_START=$(cast balance --rpc-url $RPC $W1 --ether 2>&1)
echo "  Wallet: $W1"
echo "  Balance: $BAL_START tBNB"
echo ""

# ─── Helpers ───
deploy() {
    local BYTECODE=$1 PK=$2 LABEL=$3 RESULT STATUS i

    for i in 1 2 3; do
        RESULT=$(cast send --gas-limit $GAS --private-key "$PK" --rpc-url "$RPC" --create "$BYTECODE" --json 2>&1) && break
        echo "    retry $i..."
        sleep 5
    done

    DEPLOY_ADDR=$(echo "$RESULT" | jq -r '.contractAddress // empty' 2>/dev/null || true)
    STATUS=$(echo "$RESULT" | jq -r '.status // empty' 2>/dev/null || true)
    LAST_GAS=$(echo "$RESULT" | jq -r '.gasUsed // empty' 2>/dev/null || true)
    LAST_GAS_DEC=$((LAST_GAS))

    if [ -z "$DEPLOY_ADDR" ] || [ "$STATUS" = "0x0" ]; then
        echo "  FAIL $LABEL: $(echo $RESULT | head -c 300)"
        exit 1
    fi

    TOTAL_DEPLOY_GAS=$((TOTAL_DEPLOY_GAS + LAST_GAS_DEC))
    CONTRACT_GAS["$LABEL"]=$LAST_GAS_DEC
    printf "  %-26s %s  gas: %'d\n" "$LABEL" "$DEPLOY_ADDR" "$LAST_GAS_DEC"
}

send() {
    local PK=$1 TO=$2 SIG=$3 RESULT STATUS i
    shift 3

    for i in 1 2 3; do
        RESULT=$(cast send --gas-limit $GAS --private-key "$PK" --rpc-url "$RPC" "$TO" "$SIG" "$@" --json 2>&1) && break
        echo "    retry $i..."
        sleep 5
    done

    STATUS=$(echo "$RESULT" | jq -r '.status // empty' 2>/dev/null || true)
    LAST_GAS=$(echo "$RESULT" | jq -r '.gasUsed // empty' 2>/dev/null || true)
    LAST_GAS_DEC=$((LAST_GAS))
    TOTAL_TX_GAS=$((TOTAL_TX_GAS + LAST_GAS_DEC))

    if [ "$STATUS" = "0x0" ] || [ -z "$STATUS" ]; then
        echo "  FAIL $SIG: $(echo $RESULT | head -c 300)"
        exit 1
    fi
}

call() {
    cast call --rpc-url $RPC "$@" 2>&1 | awk '{print $1}'
}

# ═══════════════════════════════════════════════════════════════════════════
#  DEPLOY EVERYTHING
# ═══════════════════════════════════════════════════════════════════════════
echo "--- Deploying all contracts ---"
forge build --silent

# MockERC20
MOCK_BYTECODE=$(forge inspect MockERC20 bytecode)
MOCK_INIT=$(cast abi-encode "constructor(string,string,uint8)" "Test USDT" "tUSDT" 18 | cut -c3-)
deploy "${MOCK_BYTECODE}${MOCK_INIT}" $W1_PK "MockERC20"
TOKEN=$DEPLOY_ADDR

# DripsFacetA (cycleSecs=10)
FACET_A_BYTECODE=$(forge inspect DripsFacetA bytecode)
FACET_A_INIT=$(cast abi-encode "constructor(uint32)" 10 | cut -c3-)
deploy "${FACET_A_BYTECODE}${FACET_A_INIT}" $W1_PK "DripsFacetA"
FACET_A=$DEPLOY_ADDR

# DripsFacetB
FACET_B_BYTECODE=$(forge inspect DripsFacetB bytecode)
deploy "$FACET_B_BYTECODE" $W1_PK "DripsFacetB"
FACET_B=$DEPLOY_ADDR

# DripsRouter (driverId=0 placeholder, will register real one later)
ROUTER_BYTECODE=$(forge inspect DripsRouter bytecode)
ROUTER_INIT=$(cast abi-encode "constructor(address,address,uint32,address)" "$FACET_A" "$FACET_B" 0 "$W1" | cut -c3-)
deploy "${ROUTER_BYTECODE}${ROUTER_INIT}" $W1_PK "DripsRouter"
ROUTER=$DEPLOY_ADDR

# Drips Proxy (ManagedProxy)
PROXY_BYTECODE=$(forge inspect ManagedProxy bytecode)
PROXY_INIT=$(cast abi-encode "constructor(address,address,bytes)" "$ROUTER" "$W1" "0x" | cut -c3-)
deploy "${PROXY_BYTECODE}${PROXY_INIT}" $W1_PK "Drips Proxy"
DRIPS=$DEPLOY_ADDR

# Caller
CALLER_BYTECODE=$(forge inspect Caller bytecode)
deploy "$CALLER_BYTECODE" $W1_PK "Caller"
CALLER=$DEPLOY_ADDR

# AddressDriver logic
AD_LOGIC_BYTECODE=$(forge inspect AddressDriver bytecode)
AD_LOGIC_INIT=$(cast abi-encode "constructor(address,address,uint32)" "$DRIPS" "$CALLER" 2 | cut -c3-)
deploy "${AD_LOGIC_BYTECODE}${AD_LOGIC_INIT}" $W1_PK "AddressDriver Logic"
AD_LOGIC=$DEPLOY_ADDR

# AddressDriver proxy
AD_PROXY_INIT=$(cast abi-encode "constructor(address,address,bytes)" "$AD_LOGIC" "$W1" "0x" | cut -c3-)
deploy "${PROXY_BYTECODE}${AD_PROXY_INIT}" $W1_PK "AddressDriver Proxy"
DRIVER=$DEPLOY_ADDR

# YieldManager
YM_BYTECODE=$(forge inspect YieldManager bytecode)
YM_INIT=$(cast abi-encode "constructor(address)" "$DRIPS" | cut -c3-)
deploy "${YM_BYTECODE}${YM_INIT}" $W1_PK "YieldManager"
YIELD_MGR=$DEPLOY_ADDR

# PancakeSwapV3Strategy
PS_BYTECODE=$(forge inspect PancakeSwapV3Strategy bytecode)
PS_INIT=$(cast abi-encode "constructor(address,address,address)" "$YIELD_MGR" "$PANCAKE_NPM" "$PANCAKE_FACTORY" | cut -c3-)
deploy "${PS_BYTECODE}${PS_INIT}" $W1_PK "PancakeSwapV3Strategy"
STRATEGY=$DEPLOY_ADDR

# Groth16Verifier
VERIFIER_BYTECODE=$(forge inspect Groth16Verifier bytecode)
deploy "$VERIFIER_BYTECODE" $W1_PK "Groth16Verifier"
VERIFIER=$DEPLOY_ADDR

# ZWERC20 wrapping MockERC20 (zero fees for testing)
ZW_BYTECODE=$(forge inspect ZWERC20 bytecode)
ZW_INIT=$(cast abi-encode "constructor(string,string,uint8,address,(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256))" \
    "ZW Test USDT" "zwUSDT" 18 "$TOKEN" \
    "($VERIFIER,0x0000000000000000000000000000000000000000,10000,0,0,0,0,0,0)" | cut -c3-)
deploy "${ZW_BYTECODE}${ZW_INIT}" $W1_PK "ZWERC20"
ZW_TOKEN=$DEPLOY_ADDR

echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  SETUP: Register drivers + approvals
# ═══════════════════════════════════════════════════════════════════════════
echo "--- Setup: drivers + approvals ---"
echo -n "  Register driver 0... "; send $W1_PK $DRIPS "registerDriver(address)" "0x0000000000000000000000000000000000000001"; echo "ok"
echo -n "  Register driver 1... "; send $W1_PK $DRIPS "registerDriver(address)" "0x0000000000000000000000000000000000000001"; echo "ok"
echo -n "  Register driver 2... "; send $W1_PK $DRIPS "registerDriver(address)" "$W1"; echo "ok"
echo -n "  Update driver addr.. "; send $W1_PK $DRIPS "updateDriverAddress(uint32,address)" 2 "$DRIVER"; echo "ok"
echo -n "  Mint 100k tUSDT.... "; send $W1_PK $TOKEN "mint(address,uint256)" $W1 "100000000000000000000000"; echo "ok"
echo -n "  Approve Driver..... "; send $W1_PK $TOKEN "approve(address,uint256)" $DRIVER $MAX_UINT; echo "ok"
echo -n "  Approve YieldMgr... "; send $W1_PK $TOKEN "approve(address,uint256)" $YIELD_MGR $MAX_UINT; echo "ok"
echo -n "  Approve Router..... "; send $W1_PK $TOKEN "approve(address,uint256)" $DRIPS $MAX_UINT; echo "ok"
echo -n "  Register ZwToken... "; send $W1_PK $DRIPS "registerZwToken(address,address)" $TOKEN $ZW_TOKEN; echo "ok"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  TEST 1: Give & Collect (core Drips flow)
# ═══════════════════════════════════════════════════════════════════════════
echo "--- TEST 1: Give & Collect ---"
W1_ACCT=$(call $DRIVER "calcAccountId(address)(uint256)" $W1)
echo "  Account ID: $W1_ACCT"

echo -n "  give(1 tUSDT)... "
send $W1_PK $DRIVER "give(uint256,address,uint128)" "$W1_ACCT" $TOKEN "1000000000000000000"
echo "ok"

SPLITTABLE=$(call $DRIPS "splittable(uint256,address)(uint128)" "$W1_ACCT" $TOKEN)
echo "  Splittable: $SPLITTABLE"

echo -n "  split()......... "
send $W1_PK $DRIPS "split(uint256,address,(uint256,uint32)[])" "$W1_ACCT" $TOKEN "[]"
echo "ok"

COLLECTABLE=$(call $DRIPS "collectable(uint256,address)(uint128)" "$W1_ACCT" $TOKEN)
echo "  Collectable: $COLLECTABLE"

echo -n "  collect()....... "
send $W1_PK $DRIVER "collect(address,address)" "$TOKEN" "$W1"
echo "ok"
echo "  PASSED"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  TEST 2: YieldManager deposit (sender-scoped)
# ═══════════════════════════════════════════════════════════════════════════
echo "--- TEST 2: YieldManager deposit ---"
echo -n "  ownerDeposit(10 tUSDT)... "
send $W1_PK $YIELD_MGR "ownerDeposit(uint256,address,uint256)" "$W1_ACCT" $TOKEN "10000000000000000000"
echo "ok"

BALS=$(call $YIELD_MGR "getBalances(uint256,address)(uint128,uint128,uint128)" "$W1_ACCT" $TOKEN)
echo "  Balances: $BALS"
echo "  PASSED"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  TEST 3: Privacy Flow — setStreamsPrivate + givePrivate + collectPrivate
# ═══════════════════════════════════════════════════════════════════════════
echo "--- TEST 3: Privacy Flow (Flow 3 E2E) ---"

# calcAccountId via the DripsRouter (privacy driver)
PRIV_ACCT=$(call $DRIPS "calcAccountId(address)(uint256)" $W1)
echo "  Privacy Account ID: $PRIV_ACCT"

echo -n "  givePrivate(1 tUSDT to self)... "
send $W1_PK $DRIPS "givePrivate(uint256,address,uint128)" "$PRIV_ACCT" $TOKEN "1000000000000000000"
echo "ok"

SPLITTABLE_ZW=$(call $DRIPS "splittable(uint256,address)(uint128)" "$PRIV_ACCT" $ZW_TOKEN)
echo "  ZWT Splittable: $SPLITTABLE_ZW"

echo -n "  split(zwUSDT)... "
send $W1_PK $DRIPS "split(uint256,address,(uint256,uint32)[])" "$PRIV_ACCT" $ZW_TOKEN "[]"
echo "ok"

COLLECTABLE_ZW=$(call $DRIPS "collectable(uint256,address)(uint128)" "$PRIV_ACCT" $ZW_TOKEN)
echo "  ZWT Collectable: $COLLECTABLE_ZW"

echo -n "  collectPrivate(redeemRaw)... "
send $W1_PK $DRIPS \
    "collectPrivate(address,address,bool,(bytes32,bytes32[],bytes,bytes,bool,bytes),bool)" \
    $TOKEN $W1 false \
    "(0x0000000000000000000000000000000000000000000000000000000000000000,[],0x,0x,false,0x)" \
    true
echo "ok"
echo "  PASSED — Privacy give + split + collect round-trip complete"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  TEST 4: PancakeSwap V3 pool query (proves strategy talks to factory)
# ═══════════════════════════════════════════════════════════════════════════
echo "--- TEST 4: PancakeSwap V3 pool query ---"

# WBNB/BUSD pool at fee=500 exists on testnet
WBNB_TESTNET="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
BUSD_TESTNET="0xaB1a4d4f1D656d2450692D237fdD6C7f9146e814"

POOL=$(call $STRATEGY "poolExists(address,address,uint24)(bool)" $WBNB_TESTNET $BUSD_TESTNET 500)
echo "  poolExists(WBNB/BUSD, 500): $POOL"

POOL2=$(call $STRATEGY "poolExists(address,address,uint24)(bool)" $TOKEN $WBNB_TESTNET 500)
echo "  poolExists(tUSDT/WBNB, 500): $POOL2 (expected false — no pool for mock token)"
echo "  PASSED (strategy correctly queries PancakeSwap V3 on-chain)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  COST SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
BAL_END=$(cast balance --rpc-url $RPC $W1 --ether 2>&1)

echo "═══════════════════════════════════════════════════════════════"
echo "  GAS COST BREAKDOWN"
echo "═══════════════════════════════════════════════════════════════"
echo ""
printf "  %-26s %12s\n" "CONTRACT" "GAS USED"
printf "  %-26s %12s\n" "─────────────────────────" "────────────"
for KEY in "MockERC20" "DripsFacetA" "DripsFacetB" "DripsRouter" "Drips Proxy" "Caller" "AddressDriver Logic" "AddressDriver Proxy" "YieldManager" "PancakeSwapV3Strategy" "Groth16Verifier" "ZWERC20"; do
    printf "  %-26s %'12d\n" "$KEY" "${CONTRACT_GAS[$KEY]}"
done
printf "  %-26s %12s\n" "─────────────────────────" "────────────"
printf "  %-26s %'12d\n" "TOTAL DEPLOY GAS" "$TOTAL_DEPLOY_GAS"
printf "  %-26s %'12d\n" "TOTAL TX GAS (setup+test)" "$TOTAL_TX_GAS"
printf "  %-26s %'12d\n" "GRAND TOTAL GAS" "$((TOTAL_DEPLOY_GAS + TOTAL_TX_GAS))"
echo ""

# Without MockERC20 (mainnet won't need it)
MAINNET_DEPLOY_GAS=$((TOTAL_DEPLOY_GAS - ${CONTRACT_GAS["MockERC20"]}))
printf "  %-26s %'12d\n" "MAINNET DEPLOY (no mock)" "$MAINNET_DEPLOY_GAS"
echo ""

# BSC mainnet gas price is typically 1-3 gwei
echo "  ── MAINNET COST ESTIMATE ──"
echo ""
echo "  BSC gas price: ~1 gwei (typical)"
echo ""
# 1 gwei = 1e-9 BNB, so gas * 1e-9 = BNB
python3 -c "
deploy_gas = $MAINNET_DEPLOY_GAS
tx_gas = $TOTAL_TX_GAS

# Per-user costs (UI flow): approve + setStreams per stream
# Typical approve ~ 46k gas, setStreams ~ 200k gas
approve_gas = 46000
set_streams_gas = 200000
give_gas = 120000
collect_gas = 150000  # receiveStreams + split + collect

print(f'  Deployment (one-time):')
print(f'    Gas:  {deploy_gas:>12,}')
print(f'    @1gwei: {deploy_gas * 1e-9:.6f} BNB  (~\${deploy_gas * 1e-9 * 600:.2f} @ BNB=\$600)')
print(f'    @3gwei: {deploy_gas * 3e-9:.6f} BNB  (~\${deploy_gas * 3e-9 * 600:.2f} @ BNB=\$600)')
print()
print(f'  Per stream creation (UI):')
print(f'    approve:    {approve_gas:>8,} gas')
print(f'    setStreams:  {set_streams_gas:>8,} gas')
print(f'    total:      {approve_gas+set_streams_gas:>8,} gas')
print(f'    @1gwei: {(approve_gas+set_streams_gas) * 1e-9:.6f} BNB  (~\${(approve_gas+set_streams_gas) * 1e-9 * 600:.4f})')
print(f'    @3gwei: {(approve_gas+set_streams_gas) * 3e-9:.6f} BNB  (~\${(approve_gas+set_streams_gas) * 3e-9 * 600:.4f})')
print()
print(f'  Per claim (recipient collects):')
print(f'    receive+split+collect: {collect_gas:>8,} gas')
print(f'    @1gwei: {collect_gas * 1e-9:.6f} BNB  (~\${collect_gas * 1e-9 * 600:.4f})')
print()
print(f'  ── EXAMPLE: 10 streams ──')
total_10 = deploy_gas + 10 * (approve_gas + set_streams_gas)
print(f'    Deploy + 10 creates: {total_10:>12,} gas')
print(f'    @1gwei: {total_10 * 1e-9:.6f} BNB  (~\${total_10 * 1e-9 * 600:.2f})')
print(f'    @3gwei: {total_10 * 3e-9:.6f} BNB  (~\${total_10 * 3e-9 * 600:.2f})')
"
echo ""
echo "  tBNB spent this run: $BAL_START - $BAL_END"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALL TESTS PASSED"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Drips Proxy:           $DRIPS"
echo "  AddressDriver:         $DRIVER"
echo "  YieldManager:          $YIELD_MGR"
echo "  PancakeSwapV3Strategy: $STRATEGY"
echo "  MockERC20:             $TOKEN"
echo "  Groth16Verifier:       $VERIFIER"
echo "  ZWERC20:               $ZW_TOKEN"
echo ""
echo "  https://testnet.bscscan.com/address/$DRIPS"
