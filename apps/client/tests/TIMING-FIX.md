# E2E Test Timing Fix

## Problem
The e2e-collect and e2e-streaming tests were failing with `splittable = 0` even after waiting for cycles to complete. This indicated the timing logic wasn't accounting for the worst-case scenario properly.

## Root Cause
The Drips protocol has a critical timing constraint:
- A stream created at timestamp T in cycle N can only be received after cycle N+1 COMPLETES
- Worst case: T is at the very start of cycle N, requiring a wait of 2 full cycles
- Anvil auto-mines blocks every 5 seconds, but this doesn't guarantee cycle boundaries are crossed

## Solution
Changed the wait times to be more conservative:

### e2e-collect.ts
- **First wait (Act 1)**: Changed from `2*CYCLE_SECS + 5 = 25s` to `3*CYCLE_SECS = 30s`
  - This guarantees at least 2 full cycles complete (worst case scenario)
  - With CYCLE_SECS=10, this is 30 seconds
  
- **Second wait (Act 2)**: Changed from `CYCLE_SECS + 5 = 15s` to `2*CYCLE_SECS = 20s`
  - After the first receiveStreams, we need another full cycle to complete
  - 2*CYCLE_SECS ensures we cross at least one more cycle boundary

### e2e-streaming.ts
- **Wait time**: Changed from `2*CYCLE_SECS + 5 = 25s` to `3*CYCLE_SECS = 30s`
  - Same reasoning as e2e-collect Act 1
  - Guarantees at least 2 full cycles complete

## Why 3*CYCLE_SECS?
With CYCLE_SECS=10 and Anvil mining every 5s:
- Stream created at T=0 (start of cycle 0)
- Cycle 0 ends at T=10
- Cycle 1 ends at T=20
- Need to wait until T≥20 for funds to be receivable
- 3*CYCLE_SECS = 30s guarantees we're past T=20 even with block mining delays

## Testing
Run the tests with:
```bash
npm run test:e2e:stream
npm run test:e2e:collect
npm run test:e2e:privacy
npm run test:e2e  # all tests
```

## Debug Script
Use `debug-temp.ts` to verify Anvil is mining correctly:
```bash
npx tsx apps/client/tests/debug-temp.ts
```

This will sample 3 blocks over 15 seconds and confirm timestamps are advancing.
