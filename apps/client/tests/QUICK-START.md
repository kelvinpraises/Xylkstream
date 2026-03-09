# E2E Tests Quick Start

## Prerequisites
1. Anvil running on localhost:8545
2. Contracts deployed via the deploy script
3. Anvil configured with 5-second block interval (auto-mining)

## Running Tests

### Individual Tests
```bash
# Streaming test (create, receive, manage streams)
npm run test:e2e:stream

# Collect test (direct collect + force-collect by third party)
npm run test:e2e:collect

# Privacy test (shield, verify, remint with ZK proofs)
npm run test:e2e:privacy
```

### All Tests
```bash
npm run test:e2e
```

## Test Structure

### e2e-streaming.ts
Tests the complete streaming lifecycle:
- **Act 1**: Create stream (mint, approve, setStreams)
- **Act 2**: Receive & collect (wait for cycle, receiveStreams, split, collect)
- **Act 3**: Stream management (partial withdrawal, stop stream)

### e2e-collect.ts
Tests the collect flow with permissionless operations:
- **Act 1**: Bob collects directly (receiveStreams, split, collect)
- **Act 2**: Charlie force-collects for Bob (third-party permissionless calls)

### e2e-privacy.ts
Tests the privacy layer:
- **Act 1**: Shielding (deposit to privacy address)
- **Act 2**: Verification (rebuild Merkle tree, verify root)
- **Act 3**: Remint (generate ZK proof, transfer to recipient)

## Timing
All tests use conservative timing to handle Anvil's 5-second block interval:
- **First wait**: 3*CYCLE_SECS (30s with CYCLE_SECS=10)
- **Subsequent waits**: 2*CYCLE_SECS (20s)

This ensures streams have time to complete at least one full cycle before attempting to receive.

## Debugging
If tests fail with `splittable = 0`:
1. Verify Anvil is running and mining blocks
2. Run the timing verification script:
   ```bash
   npx tsx apps/client/tests/debug-temp.ts
   ```
3. Check that blocks and timestamps are advancing
4. Ensure CYCLE_SECS matches the deployed contract (should be 10)

## Common Issues

### "Invalid streams receivers list"
- Caused by dirty Anvil state from previous runs
- Tests use fresh random wallets to avoid this
- If it persists, restart Anvil and redeploy contracts

### "splittable = 0" after waiting
- Timing issue - increase wait times if needed
- Verify Anvil is auto-mining (check with debug-temp.ts)
- Ensure stream was created successfully (check tx receipt)

### Circuit artifacts not found (privacy test)
- Act 3 of privacy test requires compiled circuits
- Expected at: `apps/client/public/circuits/remint.wasm` and `remint_final.zkey`
- Acts 1-2 will still pass without circuits
