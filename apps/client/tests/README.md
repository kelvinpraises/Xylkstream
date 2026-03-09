# Xylkstream E2E Tests

End-to-end test scripts for the Xylkstream client hooks. These tests run against a local Anvil instance with all contracts deployed.

## Prerequisites

1. **Start Anvil** with the deployed contracts:
   ```bash
   # From the contracts directory
   cd apps/contracts
   anvil
   ```

2. **Deploy contracts** to the local Anvil instance (in a separate terminal):
   ```bash
   # Deploy all contracts to Anvil
   npm run deploy:local
   ```

## Test Files

### 1. `e2e-streaming.ts`
Tests the complete streaming flow:
- Mint mock USDC to Alice
- Alice approves AddressDriver
- Alice creates stream to Bob
- Advance time 10 seconds
- Call receiveStreams for Bob
- Call split for Bob
- Bob collects USDC
- Verify Bob's balance increased

**Run:**
```bash
npm run test:e2e:stream
```

### 2. `e2e-privacy.ts`
Tests the privacy deposit → remint flow:
- Mint mock USDC to Alice
- Alice approves zwUSDC contract
- Alice deposits USDC into zwUSDC
- Generate privacy secret and derive privacy address
- Alice transfers zwUSDC to privacy address
- Read Merkle tree leaves from chain and rebuild tree locally
- Generate ZK proof for remint (requires circuit artifacts)
- Call remint on zwUSDC
- Verify remint succeeded

**Note:** Steps 7-9 (ZK proof generation) require circuit artifacts at `apps/client/public/circuits/`:
- `remint.wasm`
- `remint_final.zkey`

If these files are missing, the test will run steps 1-6 and skip the proof generation.

**Run:**
```bash
npm run test:e2e:privacy
```

### 3. `e2e-collect.ts`
Tests the force-collect and collect-from-sender flow:
- Setup: Alice streams to Bob
- Advance time
- Bob calls receiveStreams + split + collect (normal 3-step pipeline)
- Verify Bob received funds
- Test force-collect: anyone can call receiveStreams/split for Bob
- Verify force-collect succeeded

**Run:**
```bash
npm run test:e2e:collect
```

## Run All Tests

To run all e2e tests sequentially:
```bash
npm run test:e2e
```

## Contract Addresses (Anvil localhost, chainId 31337)

The tests use these hardcoded addresses from the local deployment:

**Streaming:**
- dripsProxy: `0x9a676e781a523b5d0c0e43731313a708cb607508`
- addressDriverProxy: `0xc6e7df5e7b4f2a278906862b61205850344d4e7d`
- yieldManager: `0x4ed7c70f96b99c776995fb64377f0d4ab3b0e1c1`

**Privacy:**
- zwUSDC: `0x8a791620dd6260079bf849dc5567adc3f2fdc318`
- zwUSDT: `0x610178da211fef7d417bc0e6fed39f05609ad788`
- mockUSDC: `0xa513e6e4b8f2a923d98304ec87f64353c4d5c853`
- mockUSDT: `0x2279b7a0a67db372996a5fab50d91eaa73d2ebe6`

**Deployer (Anvil account 0):**
- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

## Test Accounts

The tests use standard Anvil accounts:
- **Account 0 (deployer)**: Can mint mock tokens
- **Account 1 (alice/sender)**: Creates streams
- **Account 2 (bob/receiver)**: Receives streams

## Troubleshooting

### "Connection refused" error
Make sure Anvil is running on `http://127.0.0.1:8545`

### "Contract not deployed" error
Ensure contracts are deployed to the local Anvil instance with the correct addresses

### "Insufficient balance" error
The deployer account should have ETH and can mint mock tokens. If tests fail, restart Anvil to reset state.

### Privacy test skips steps 7-9
Circuit artifacts are not found. This is expected if you haven't generated the ZK circuits yet. Steps 1-6 will still validate the deposit and Merkle tree logic.

## Implementation Details

These tests use:
- **viem** for blockchain interactions
- **tsx** for TypeScript execution
- Contract ABIs and helpers from `src/lib/drips.ts`
- Privacy functions from `src/lib/privacy/`
- Anvil's `evm_increaseTime` and `evm_mine` for time manipulation

Each test is self-contained and prints clear pass/fail output with `process.exit(1)` on failure.
