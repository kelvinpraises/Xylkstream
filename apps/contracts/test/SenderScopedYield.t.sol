// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IDrips} from "src/protocol/IDrips.sol";
import {DripsFacetA} from "src/protocol/DripsFacetA.sol";
import {DripsFacetB} from "src/protocol/DripsFacetB.sol";
import {DripsRouter} from "src/protocol/DripsRouter.sol";
import {StreamReceiver, StreamConfig, StreamConfigImpl} from "src/protocol/Streams.sol";
import {SplitsReceiver} from "src/protocol/Splits.sol";
import {AddressDriver} from "src/drivers/AddressDriver.sol";
import {Caller} from "src/protocol/Caller.sol";
import {Managed, ManagedProxy} from "src/protocol/Managed.sol";
import {YieldManager, IYieldStrategy} from "src/yield/YieldManager.sol";
import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/token/ERC20/ERC20.sol";

// ─── Test ERC20 ───────────────────────────────────────────────────────────────
contract ScopedTestToken is ERC20 {
    constructor() ERC20("Test", "TST") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

// ─── Test Strategy ─────────────────────────────────────────────────────────────
/// Supports both the normal invest/withdraw path and the forceWithdraw path that
/// AddressDriver.forceCollect invokes via a low-level call.
contract ScopedTestStrategy is IYieldStrategy {
    address public yieldManager;
    IERC20  public activeToken;

    constructor(address _ym) { yieldManager = _ym; }

    // Called by YieldManager.positionOpen.
    function invest(uint256 amount, bytes calldata strategyData)
        external override
        returns (bytes memory positionData)
    {
        if (strategyData.length > 0) {
            activeToken = abi.decode(strategyData, (IERC20));
        }
        positionData = abi.encode(amount);
    }

    // Called by YieldManager.positionClose.
    // Drains the strategy's entire token balance back to YieldManager (msg.sender).
    function withdraw(bytes calldata, uint256, bytes calldata)
        external override
        returns (uint256 withdrawn)
    {
        uint256 bal = activeToken.balanceOf(address(this));
        if (bal > 0) require(activeToken.transfer(msg.sender, bal), "transfer failed");
        withdrawn = bal;
    }

    // Called by AddressDriver.forceCollect via low-level call:
    //   strategy.forceWithdraw(yieldManager, accountId, amount, strategyData)
    // Flow: transfer `amount` tokens to yieldManager, then call completeForceWithdrawal
    // so YieldManager can forward them to the recipient.
    function forceWithdraw(
        address _yieldManager,
        uint256 accountId,
        uint128 amount,
        bytes calldata /* strategyData */
    ) external {
        require(activeToken.transfer(_yieldManager, amount), "transfer failed");
        YieldManager(_yieldManager).completeForceWithdrawal(
            accountId, address(this), activeToken, amount
        );
    }

    // Allow test setup to update the active token.
    function setActiveToken(IERC20 t) external { activeToken = t; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                     SENDER-SCOPED YIELD TEST CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════
contract SenderScopedYieldTest is Test {
    ScopedTestToken  token;
    IDrips           drips;
    Caller           caller;
    AddressDriver    driver;
    YieldManager     yieldManager;
    ScopedTestStrategy strategy;

    // address(this) is the YieldManager owner
    address admin   = address(this);

    // Actors
    address alice   = address(0xA11CE); // sender1
    address bob     = address(0xB0B);   // sender2
    address charlie = address(0xC0C);   // recipient
    address dave    = address(0xDA7E);  // unauthorized

    uint32 driverId;

    // Pre-computed account IDs (must not use vm.prank before these)
    uint256 aliceAcct;
    uint256 bobAcct;
    uint256 charlieAcct;
    uint256 daveAcct;

    // Reusable empty arrays
    SplitsReceiver[] internal noSplits;
    StreamReceiver[]  internal noReceivers;

    // ═══════════════════════════════════════════════════════════════════════════
    //                                SET UP
    // ═══════════════════════════════════════════════════════════════════════════

    function setUp() public {
        token = new ScopedTestToken();

        DripsFacetA facetA = new DripsFacetA(10);
        DripsFacetB facetB = new DripsFacetB();
        DripsRouter router  = new DripsRouter(address(facetA), address(facetB), 0, admin);
        drips = IDrips(address(new ManagedProxy(Managed(address(router)), admin, "")));

        caller = new Caller();

        driverId = drips.registerDriver(admin);
        AddressDriver driverLogic = new AddressDriver(drips, address(caller), driverId);
        driver = AddressDriver(address(new ManagedProxy(driverLogic, admin, "")));
        drips.updateDriverAddress(driverId, address(driver));

        // YieldManager — owner == address(this)
        yieldManager = new YieldManager(address(drips));
        strategy     = new ScopedTestStrategy(address(yieldManager));

        // Pre-compute account IDs BEFORE any vm.prank usage
        aliceAcct   = driver.calcAccountId(alice);
        bobAcct     = driver.calcAccountId(bob);
        charlieAcct = driver.calcAccountId(charlie);
        daveAcct    = driver.calcAccountId(dave);

        // Fund actors
        token.mint(alice,   100_000e6);
        token.mint(bob,     100_000e6);
        token.mint(charlie, 100_000e6);
        token.mint(dave,    100_000e6);

        vm.startPrank(alice);
        token.approve(address(driver), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(driver), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(charlie);
        token.approve(address(driver), type(uint256).max);
        vm.stopPrank();

        // YieldManager.ownerDeposit uses transferFrom(msg.sender, …)
        token.approve(address(yieldManager), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   Helpers
    // ═══════════════════════════════════════════════════════════════════════════

    /// Give the test contract (admin/owner) `amount` tokens and approve YieldManager.
    function _mintForAdmin(uint256 amount) internal {
        token.mint(admin, amount);
        // approval already set to max in setUp — no-op needed
    }

    /// Simulate drips lending `amount` tokens to YM by:
    ///   1. Minting `amount` directly into the YM (so YM holds them)
    ///   2. Calling dripsDeposit as the drips contract to update accounting
    /// This lets us test force-collect flows without a real bridged flow.
    function _dripsDeposit(uint256 senderAcct, uint256 amount) internal {
        token.mint(address(yieldManager), amount);
        vm.prank(address(drips));
        yieldManager.dripsDeposit(senderAcct, IERC20(address(token)), amount);
    }

    /// Drain the drips contract's token balance so that heldBalance < collectableAmt.
    /// forceCollect requires `erc20.balanceOf(drips) < collectable(accountId)`.
    /// We move all tokens EXCEPT (collectableAmt - 1) out of drips.
    /// The surplus tokens go to `to`; drips accounting (splits balance) stays at collectableAmt.
    function _drainDripsToTriggerForceCollect(uint256 collectableAmt, address to) internal {
        uint256 heldBalance = token.balanceOf(address(drips));
        // We want heldBalance - drain < collectableAmt  →  drain > heldBalance - collectableAmt
        // Leave (collectableAmt - 1) in drips so the condition fires.
        uint256 remaining = collectableAmt - 1;
        require(heldBalance > remaining, "nothing to drain");
        uint256 drain = heldBalance - remaining;
        vm.prank(address(drips));
        require(token.transfer(to, drain), "transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 1 — SENDER ISOLATION
    // ═══════════════════════════════════════════════════════════════════════════

    /// Alice and Bob each deposit via ownerDeposit.
    /// Each sender's balances should reflect only their own deposit.
    function test_two_senders_have_independent_accounts() public {
        uint256 aliceDeposit = 1_000e6;
        uint256 bobDeposit   = 2_500e6;
        _mintForAdmin(aliceDeposit + bobDeposit);

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), aliceDeposit);
        yieldManager.ownerDeposit(bobAcct,   IERC20(address(token)), bobDeposit);

        (uint128 aPrincipal, uint128 aLiquid, uint128 aInvested) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (uint128 bPrincipal, uint128 bLiquid, uint128 bInvested) =
            yieldManager.getBalances(bobAcct,   IERC20(address(token)));

        assertEq(aPrincipal, aliceDeposit, "Alice: principal");
        assertEq(aLiquid,    aliceDeposit, "Alice: liquid");
        assertEq(aInvested,  0,            "Alice: invested 0");

        assertEq(bPrincipal, bobDeposit,   "Bob: principal");
        assertEq(bLiquid,    bobDeposit,   "Bob: liquid");
        assertEq(bInvested,  0,            "Bob: invested 0");

        // Deposits must not bleed across scopes
        assertTrue(aPrincipal != bPrincipal, "Accounts are independent");
    }

    /// Open positions for Alice and Bob on the same strategy.
    /// getPosition must return independent amounts for each.
    function test_position_open_scoped_to_sender() public {
        uint256 aliceDeposit = 1_000e6;
        uint256 bobDeposit   = 3_000e6;
        _mintForAdmin(aliceDeposit + bobDeposit);

        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), aliceDeposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), aliceDeposit, stratData);

        yieldManager.ownerDeposit(bobAcct, IERC20(address(token)), bobDeposit);
        yieldManager.positionOpen(bobAcct, IERC20(address(token)), address(strategy), bobDeposit, stratData);

        (, uint128 alicePos, ) = yieldManager.getPosition(aliceAcct, IERC20(address(token)), address(strategy));
        (, uint128 bobPos,   ) = yieldManager.getPosition(bobAcct,   IERC20(address(token)), address(strategy));

        assertEq(alicePos, aliceDeposit, "Alice position amount");
        assertEq(bobPos,   bobDeposit,   "Bob position amount");
        assertTrue(alicePos != bobPos,   "Positions are independent per sender key");
    }

    /// Close Alice's position and confirm Bob's accounting is unchanged.
    function test_position_close_only_affects_sender_scope() public {
        uint256 aliceDeposit = 1_000e6;
        uint256 bobDeposit   = 2_000e6;
        _mintForAdmin(aliceDeposit + bobDeposit);

        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), aliceDeposit);
        yieldManager.ownerDeposit(bobAcct,   IERC20(address(token)), bobDeposit);

        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), aliceDeposit, stratData);
        yieldManager.positionOpen(bobAcct,   IERC20(address(token)), address(strategy), bobDeposit,   stratData);

        // Snapshot Bob before Alice closes
        (uint128 bPrinBefore, , uint128 bInvBefore) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));
        (, uint128 bPosBefore, ) =
            yieldManager.getPosition(bobAcct, IERC20(address(token)), address(strategy));

        // Snapshot Alice before close
        (uint128 aPrinBefore, , uint128 aInvBefore) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));

        // Close Alice's position — TestStrategy.withdraw drains all tokens it holds.
        // After Alice's close the strategy might be empty; Bob's accounting stays in YM.
        yieldManager.positionClose(aliceAcct, IERC20(address(token)), address(strategy), "");

        // Alice's invested balance must have decreased (bidirectional: actor's state changed)
        (, uint128 aLiqAfter, uint128 aInvAfter) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(aInvAfter, 0, "Alice: invested 0 after close");
        assertGt(aLiqAfter, 0, "Alice: liquid restored after close");

        // Bob's accounting must not have changed
        (uint128 bPrinAfter, , uint128 bInvAfter) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));
        (, uint128 bPosAfter, ) =
            yieldManager.getPosition(bobAcct, IERC20(address(token)), address(strategy));

        assertEq(bPrinAfter, bPrinBefore, "Bob principal unchanged");
        assertEq(bInvAfter,  bInvBefore,  "Bob invested unchanged");
        assertEq(bPosAfter,  bPosBefore,  "Bob position unchanged");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 2 — RECIPIENT COLLECTS FROM DIFFERENT SENDERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Set up a collectable balance for Charlie, drain drips so forceCollect can fire,
    /// then verify Charlie force-collects using Alice's senderAccountId.
    /// Bob's YM account must be untouched.
    function test_force_collect_from_specific_sender() public {
        // ── 1. Stream tokens from Alice to Charlie ───────────────────────────
        uint160 amtPerSec = uint160(1e6) * drips.AMT_PER_SEC_MULTIPLIER();
        StreamConfig config = StreamConfigImpl.create(1, amtPerSec, 0, 0);

        StreamReceiver[] memory charlieReceivers = new StreamReceiver[](1);
        charlieReceivers[0] = StreamReceiver({accountId: charlieAcct, config: config});

        vm.startPrank(alice);
        // 500e6 fits in uint128, safe to cast to int128
        // forge-lint: disable-next-line(unsafe-typecast)
        driver.setStreams(
            IERC20(address(token)), noReceivers, int128(uint128(500e6)), charlieReceivers, 0, 0, alice
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 15);
        drips.receiveStreams(charlieAcct, IERC20(address(token)), 100);
        drips.split(charlieAcct, IERC20(address(token)), noSplits);

        uint128 collectableAmt = drips.collectable(charlieAcct, IERC20(address(token)));
        assertGt(collectableAmt, 0, "Charlie must have collectable balance");

        // ── 2. Fund YM for Alice and open a position ─────────────────────────
        uint256 ymDeposit = uint256(collectableAmt);
        _mintForAdmin(ymDeposit);
        bytes memory stratData = abi.encode(address(token));
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), ymDeposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), ymDeposit, stratData);

        // ── 3. Drain drips contract so heldBalance < collectableAmt ──────────
        // drips holds the full stream deposit; we must reduce its balance to just below
        // collectableAmt so that forceCollect's guard (heldBalance < collectable) fires.
        // The drained tokens go to the strategy so they're available for forceWithdraw.
        _drainDripsToTriggerForceCollect(collectableAmt, address(strategy));

        // ── 4. Snapshot Bob (no YM position) and Charlie balance ─────────────
        (, uint128 bobPosBefore, ) =
            yieldManager.getPosition(bobAcct, IERC20(address(token)), address(strategy));
        uint256 charlieBalBefore = token.balanceOf(charlie);

        // ── 5. Snapshot Alice's YM state before force-collect ────────────────
        (uint128 alicePrinBefore, , uint128 aliceInvBefore) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (, uint128 alicePosBefore, ) =
            yieldManager.getPosition(aliceAcct, IERC20(address(token)), address(strategy));

        // ── 6. Charlie force-collects specifying Alice's senderAccountId ─────
        vm.startPrank(charlie);
        driver.forceCollect(
            IERC20(address(token)),
            address(yieldManager),
            address(strategy),
            aliceAcct,   // senderAccountId = Alice
            charlie,
            stratData
        );
        vm.stopPrank();

        // ── 7. Bob's position remains unchanged ──────────────────────────────
        (, uint128 bobPosAfter, ) =
            yieldManager.getPosition(bobAcct, IERC20(address(token)), address(strategy));
        assertEq(bobPosAfter, bobPosBefore, "Bob's position must not change");

        // ── 8. Charlie actually received tokens ──────────────────────────────
        uint256 charlieBalAfter = token.balanceOf(charlie);
        assertGt(charlieBalAfter, charlieBalBefore, "Charlie must receive tokens");
        assertEq(charlieBalAfter - charlieBalBefore, collectableAmt, "Charlie receives exact collectable amount");

        // ── 9. Alice's YM state was reduced (sender who was drawn from) ──────
        (, , uint128 aliceInvAfter) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (, uint128 alicePosAfter, ) =
            yieldManager.getPosition(aliceAcct, IERC20(address(token)), address(strategy));
        assertLt(aliceInvAfter, aliceInvBefore, "Alice invested balance reduced");
        assertLt(alicePosAfter, alicePosBefore, "Alice position reduced");
    }

    /// Charlie collects from Alice first, then from Bob, both successfully drawing
    /// from separate sender scopes.
    function test_force_collect_from_multiple_senders_sequentially() public {
        uint160 amtPerSec = uint160(1e6) * drips.AMT_PER_SEC_MULTIPLIER();
        StreamConfig config = StreamConfigImpl.create(1, amtPerSec, 0, 0);

        StreamReceiver[] memory charlieReceivers = new StreamReceiver[](1);
        charlieReceivers[0] = StreamReceiver({accountId: charlieAcct, config: config});

        bytes memory stratData = abi.encode(address(token));

        // ── Round 1: Alice streams → Charlie → force-collect from Alice ──────
        vm.startPrank(alice);
        // 500e6 fits in uint128, safe to cast to int128
        // forge-lint: disable-next-line(unsafe-typecast)
        driver.setStreams(
            IERC20(address(token)), noReceivers, int128(uint128(500e6)), charlieReceivers, 0, 0, alice
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 15);
        drips.receiveStreams(charlieAcct, IERC20(address(token)), 100);
        drips.split(charlieAcct, IERC20(address(token)), noSplits);

        uint128 collectableAmt1 = drips.collectable(charlieAcct, IERC20(address(token)));
        assertGt(collectableAmt1, 0, "Round1: charlie must have collectable");

        // Cancel Alice's remaining stream so drips.streamsBalance drops to 0.
        // This keeps the drips accounting clean for Round 2.
        (,,, uint128 aliceStreamBal,) = drips.streamsState(aliceAcct, IERC20(address(token)));
        vm.startPrank(alice);
        driver.setStreams(
            IERC20(address(token)),
            // aliceStreamBal fits in uint128, safe to cast to int128
            // forge-lint: disable-next-line(unsafe-typecast)
            charlieReceivers, -int128(aliceStreamBal), noReceivers,
            0, 0, alice
        );
        vm.stopPrank();

        // Now drips holds only collectableAmt1 tokens (splits balance).
        // Drain to collectableAmt1-1 so forceCollect path fires.
        _mintForAdmin(collectableAmt1);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), collectableAmt1);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), collectableAmt1, stratData);

        _drainDripsToTriggerForceCollect(collectableAmt1, address(strategy));

        uint256 charlieBalBefore1 = token.balanceOf(charlie);

        vm.startPrank(charlie);
        driver.forceCollect(
            IERC20(address(token)), address(yieldManager), address(strategy),
            aliceAcct, charlie, stratData
        );
        vm.stopPrank();

        // Charlie received tokens from round 1
        assertEq(token.balanceOf(charlie) - charlieBalBefore1, collectableAmt1, "Round1: Charlie receives tokens");

        // After Round 1: drips splitsBalance=0, streamsBalance=0, balance=collectableAmt1-1.
        // ── Round 2: Bob streams → Charlie → force-collect from Bob ──────────
        // Bob deposits 500e6. DriverTransferUtils transfers to drips first, then
        // _verifyBalanceIncrease checks: 0 + 0 + 500e6 <= (collectableAmt1-1 + 500e6) ✓
        vm.startPrank(bob);
        driver.setStreams(
            IERC20(address(token)), noReceivers, int128(uint128(500e6)), charlieReceivers, 0, 0, bob
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 15);
        drips.receiveStreams(charlieAcct, IERC20(address(token)), 100);
        drips.split(charlieAcct, IERC20(address(token)), noSplits);

        uint128 collectableAmt2 = drips.collectable(charlieAcct, IERC20(address(token)));
        assertGt(collectableAmt2, 0, "Round2: charlie must have collectable");

        // Cancel Bob's remaining stream for clean accounting
        (,,, uint128 bobStreamBal,) = drips.streamsState(bobAcct, IERC20(address(token)));
        vm.startPrank(bob);
        driver.setStreams(
            IERC20(address(token)),
            // bobStreamBal fits in uint128, safe to cast to int128
            // forge-lint: disable-next-line(unsafe-typecast)
            charlieReceivers, -int128(bobStreamBal), noReceivers,
            0, 0, bob
        );
        vm.stopPrank();

        _mintForAdmin(collectableAmt2);
        yieldManager.ownerDeposit(bobAcct, IERC20(address(token)), collectableAmt2);
        yieldManager.positionOpen(bobAcct, IERC20(address(token)), address(strategy), collectableAmt2, stratData);

        _drainDripsToTriggerForceCollect(collectableAmt2, address(strategy));

        uint256 charlieBalBefore2 = token.balanceOf(charlie);

        vm.startPrank(charlie);
        driver.forceCollect(
            IERC20(address(token)), address(yieldManager), address(strategy),
            bobAcct, charlie, stratData
        );
        vm.stopPrank();

        // Charlie received tokens from round 2
        assertEq(token.balanceOf(charlie) - charlieBalBefore2, collectableAmt2, "Round2: Charlie receives tokens");

        // Both rounds completed — Alice's and Bob's scopes were drawn independently.
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 3 — YIELD OPERATIONS PER SENDER
    // ═══════════════════════════════════════════════════════════════════════════

    /// Deposit and open positions for both Alice and Bob.
    /// Mint extra yield tokens into strategy only for Alice's close.
    /// Claim yield for Alice only — Bob's account must be unchanged.
    function test_yield_claim_scoped_to_sender() public {
        uint256 aliceDeposit = 1_000e6;
        uint256 bobDeposit   = 1_000e6;
        _mintForAdmin(aliceDeposit + bobDeposit);

        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), aliceDeposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), aliceDeposit, stratData);

        yieldManager.ownerDeposit(bobAcct, IERC20(address(token)), bobDeposit);
        yieldManager.positionOpen(bobAcct, IERC20(address(token)), address(strategy), bobDeposit, stratData);

        // Simulate yield: mint extra tokens into strategy.
        // When Alice closes, TestStrategy.withdraw drains ALL strategy tokens to YM —
        // so Alice receives principal + yield + Bob's principal (overshoot).
        // The extra credited to Alice's liquidBalance will be > alicePrincipal → yield exists.
        uint256 yieldExtra = 100e6;
        token.mint(address(strategy), yieldExtra);

        // Close Alice's position; strategy transfers everything to YM.
        yieldManager.positionClose(aliceAcct, IERC20(address(token)), address(strategy), "");

        // Snapshot Bob
        (uint128 bPrinBefore, uint128 bLiqBefore, uint128 bInvBefore) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));

        // Alice must have positive yield
        uint256 aliceYield = yieldManager.calculateYield(aliceAcct, IERC20(address(token)));
        assertGt(aliceYield, 0, "Alice should have yield");

        // Claim Alice's yield to admin
        uint256 adminBalBefore = token.balanceOf(admin);
        yieldManager.yieldClaim(aliceAcct, IERC20(address(token)), admin);
        assertGt(token.balanceOf(admin), adminBalBefore, "Admin receives Alice's yield");

        // Bob's accounting must be completely unchanged
        (uint128 bPrinAfter, uint128 bLiqAfter, uint128 bInvAfter) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));
        assertEq(bPrinAfter, bPrinBefore, "Bob principal unchanged");
        assertEq(bLiqAfter,  bLiqBefore,  "Bob liquid unchanged");
        assertEq(bInvAfter,  bInvBefore,  "Bob invested unchanged");
    }

    /// Full lifecycle for each sender independently:
    ///   ownerDeposit → positionOpen → positionClose
    function test_position_open_close_per_sender() public {
        uint256 deposit = 500e6;
        bytes memory stratData = abi.encode(address(token));

        // ── Alice ────────────────────────────────────────────────────────────
        _mintForAdmin(deposit);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        (, uint128 aLiqOpen, uint128 aInvOpen) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(aLiqOpen, 0,       "Alice: liquid 0 after open");
        assertEq(aInvOpen, deposit, "Alice: invested == deposit after open");

        yieldManager.positionClose(aliceAcct, IERC20(address(token)), address(strategy), "");
        (, uint128 aLiqClose, uint128 aInvClose) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(aInvClose, 0, "Alice: invested 0 after close");
        assertGt(aLiqClose, 0, "Alice: liquid restored after close");

        // ── Bob ──────────────────────────────────────────────────────────────
        _mintForAdmin(deposit);
        yieldManager.ownerDeposit(bobAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(bobAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        (, uint128 bLiqOpen, uint128 bInvOpen) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));
        assertEq(bLiqOpen, 0,       "Bob: liquid 0 after open");
        assertEq(bInvOpen, deposit, "Bob: invested == deposit after open");

        yieldManager.positionClose(bobAcct, IERC20(address(token)), address(strategy), "");
        (, uint128 bLiqClose, uint128 bInvClose) =
            yieldManager.getBalances(bobAcct, IERC20(address(token)));
        assertEq(bInvClose, 0, "Bob: invested 0 after close");
        assertGt(bLiqClose, 0, "Bob: liquid restored after close");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 4 — AUTHORIZATION / ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════════

    function test_only_owner_can_deposit() public {
        vm.prank(dave);
        vm.expectRevert(YieldManager.NotAuthorized.selector);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);
    }

    function test_only_owner_can_open_position() public {
        _mintForAdmin(100e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);

        vm.prank(dave);
        vm.expectRevert(YieldManager.NotAuthorized.selector);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), 100e6, "");
    }

    function test_only_owner_can_close_position() public {
        _mintForAdmin(100e6);
        bytes memory stratData = abi.encode(address(token));
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), 100e6, stratData);

        vm.prank(dave);
        vm.expectRevert(YieldManager.NotAuthorized.selector);
        yieldManager.positionClose(aliceAcct, IERC20(address(token)), address(strategy), "");
    }

    function test_only_owner_can_claim_yield() public {
        vm.prank(dave);
        vm.expectRevert(YieldManager.NotAuthorized.selector);
        yieldManager.yieldClaim(aliceAcct, IERC20(address(token)), dave);
    }

    function test_only_drips_can_call_dripsDeposit() public {
        vm.prank(dave);
        vm.expectRevert(YieldManager.OnlyDrips.selector);
        yieldManager.dripsDeposit(aliceAcct, IERC20(address(token)), 100e6);
    }

    function test_only_drips_can_call_dripsReturn() public {
        _mintForAdmin(100e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);

        vm.prank(dave);
        vm.expectRevert(YieldManager.OnlyDrips.selector);
        yieldManager.dripsReturn(aliceAcct, IERC20(address(token)), 50e6);
    }

    function test_only_drips_can_call_dripsForceWithdraw() public {
        vm.prank(dave);
        vm.expectRevert(YieldManager.OnlyDrips.selector);
        yieldManager.dripsForceWithdraw(
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), 100e6, charlie
        );
    }

    /// Dave is not the registered driver for charlieAcct.
    /// Calling drips.forceCollect directly as Dave must revert with the driver-auth string.
    function test_cannot_force_collect_without_driver_auth() public {
        // Give charlie some collectable balance
        vm.startPrank(alice);
        driver.give(charlieAcct, IERC20(address(token)), 100e6);
        vm.stopPrank();

        drips.split(charlieAcct, IERC20(address(token)), noSplits);

        // DripsFacetB.forceCollect uses require(…, "Callable only by the driver")
        // Forge encodes require-string reverts as Error(string).
        vm.prank(dave);
        vm.expectRevert(
            abi.encodeWithSignature("Error(string)", "Callable only by the driver")
        );
        drips.forceCollect(
            charlieAcct,
            IERC20(address(token)),
            address(yieldManager),
            address(strategy),
            aliceAcct,
            dave
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 5 — SAD PATHS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Depositing 0 tokens is a no-op: balances stay at 0, no revert.
    function test_deposit_zero_amount() public {
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 0);

        (uint128 principal, uint128 liquid, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(principal, 0, "principal stays 0 after zero deposit");
        assertEq(liquid,    0, "liquid stays 0 after zero deposit");
    }

    /// Opening a position larger than liquidBalance must revert with InsufficientLiquid.
    function test_position_open_exceeds_liquid_balance() public {
        _mintForAdmin(100e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);

        vm.expectRevert(YieldManager.InsufficientLiquid.selector);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), 100e6 + 1, "");
    }

    /// Closing a position that was never opened must revert with PositionNotFound.
    function test_position_close_nonexistent() public {
        vm.expectRevert(YieldManager.PositionNotFound.selector);
        yieldManager.positionClose(aliceAcct, IERC20(address(token)), address(strategy), "");
    }

    /// When total == principal (no yield earned), yieldClaim is a no-op that transfers 0.
    /// The NoYield guard only fires when total STRICTLY LESS THAN principal.
    /// This test verifies the actual contract behaviour: 0-yield claim succeeds silently.
    function test_yield_claim_no_yield() public {
        _mintForAdmin(100e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);
        // liquid == principal == 100e6; invested == 0  →  total == principal → yieldAmount == 0

        uint256 adminBalBefore = token.balanceOf(admin);

        // Should NOT revert — the contract transfers 0 and emits YieldClaimed(amount=0)
        yieldManager.yieldClaim(aliceAcct, IERC20(address(token)), admin);

        // Admin balance unchanged (0 transferred)
        assertEq(token.balanceOf(admin), adminBalBefore, "0 yield transferred");

        // Account balances unchanged
        (uint128 principal, uint128 liquid, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(principal, 100e6, "principal unchanged after zero-yield claim");
        assertEq(liquid,    100e6, "liquid unchanged after zero-yield claim");
    }

    /// dripsReturn with amount exceeding liquidBalance must revert with InsufficientLiquid.
    /// Impersonate the drips contract to bypass onlyDrips.
    function test_drips_return_exceeds_liquid() public {
        _mintForAdmin(100e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100e6);

        // Move all liquid into a position → liquidBalance = 0
        bytes memory stratData = abi.encode(address(token));
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), 100e6, stratData);

        vm.prank(address(drips));
        vm.expectRevert(YieldManager.InsufficientLiquid.selector);
        yieldManager.dripsReturn(aliceAcct, IERC20(address(token)), 100e6);
    }

    /// dripsForceWithdraw succeeds (creates pending state).
    /// completeForceWithdrawal with a non-existent position reverts with PositionNotFound.
    function test_force_withdraw_exceeds_position() public {
        // Fund YM but do NOT open a position
        _mintForAdmin(50e6);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 50e6);

        // Drips creates a pending withdrawal
        vm.prank(address(drips));
        yieldManager.dripsForceWithdraw(
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), 50e6, charlie
        );

        // completeForceWithdrawal finds no position → PositionNotFound
        vm.expectRevert(YieldManager.PositionNotFound.selector);
        yieldManager.completeForceWithdrawal(
            charlieAcct, address(strategy), IERC20(address(token)), 50e6
        );
    }

    /// The first completeForceWithdrawal succeeds.
    /// After state is deleted (amount reset to 0), the second call reverts with WithdrawalNotFound.
    function test_complete_force_withdrawal_already_consumed() public {
        uint256 deposit = 100e6;
        _mintForAdmin(deposit);
        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        vm.prank(address(drips));
        yieldManager.dripsForceWithdraw(
            // deposit fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), uint128(deposit), charlie
        );

        // strategy holds `deposit` tokens (from positionOpen).
        // Call through the strategy naturally — strategy transfers tokens to YM
        // and calls completeForceWithdrawal itself, just like the real forceCollect flow.
        // deposit fits in uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        strategy.forceWithdraw(address(yieldManager), charlieAcct, uint128(deposit), "");

        // First consumption complete; state deleted.  Second call → WithdrawalNotFound.
        vm.expectRevert(YieldManager.WithdrawalNotFound.selector);
        yieldManager.completeForceWithdrawal(
            // deposit fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            charlieAcct, address(strategy), IERC20(address(token)), uint128(deposit)
        );
    }

    /// completeForceWithdrawal with wrong strategy reverts with WrongStrategy.
    function test_complete_force_withdrawal_wrong_params() public {
        uint256 deposit = 100e6;
        _mintForAdmin(deposit);
        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        vm.prank(address(drips));
        yieldManager.dripsForceWithdraw(
            // deposit fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), uint128(deposit), charlie
        );

        // Wrong strategy → WrongStrategy
        vm.expectRevert(YieldManager.WrongStrategy.selector);
        yieldManager.completeForceWithdrawal(
            // deposit fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            charlieAcct, address(0xDEAD), IERC20(address(token)), uint128(deposit)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //   GROUP 6 — HAPPY-PATH COVERAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// Querying getBalances for an account that never deposited returns all zeros.
    function test_get_balances_uninitialized_account() public view {
        (uint128 principal, uint128 liquid, uint128 invested) =
            yieldManager.getBalances(daveAcct, IERC20(address(token)));
        assertEq(principal, 0, "uninitialized principal");
        assertEq(liquid,    0, "uninitialized liquid");
        assertEq(invested,  0, "uninitialized invested");
    }

    /// Two senders deposit the exact same amount; each sees only their own principal.
    function test_two_senders_same_deposit_amount() public {
        uint256 amount = 500e6;
        _mintForAdmin(amount * 2);

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), amount);
        yieldManager.ownerDeposit(bobAcct,   IERC20(address(token)), amount);

        (uint128 aPrincipal, uint128 aLiquid, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (uint128 bPrincipal, uint128 bLiquid, ) =
            yieldManager.getBalances(bobAcct,   IERC20(address(token)));

        assertEq(aPrincipal, amount, "Alice principal == 500e6");
        assertEq(aLiquid,    amount, "Alice liquid == 500e6");
        assertEq(bPrincipal, amount, "Bob principal == 500e6");
        assertEq(bLiquid,    amount, "Bob liquid == 500e6");

        // Crucially: neither sees 1000e6
        assertTrue(aPrincipal != amount * 2, "Alice must not see combined total");
        assertTrue(bPrincipal != amount * 2, "Bob must not see combined total");
    }

    /// dripsDeposit (called by drips contract) increases principal and liquidBalance.
    function test_drips_deposit_happy_path() public {
        uint256 amount = 200e6;

        // Snapshot before
        (uint128 prinBefore, uint128 liqBefore, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));

        // Simulate drips depositing
        _dripsDeposit(aliceAcct, amount);

        (uint128 prinAfter, uint128 liqAfter, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));

        assertEq(prinAfter - prinBefore, amount, "principal increased by deposit amount");
        assertEq(liqAfter  - liqBefore,  amount, "liquid increased by deposit amount");
    }

    /// Deposit 100e6, dripsReturn 50e6. Principal and liquid drop by 50e6.
    /// The drips contract receives the tokens.
    function test_drips_return_happy_path() public {
        uint256 deposit = 100e6;
        uint256 returnAmt = 50e6;

        _dripsDeposit(aliceAcct, deposit);

        uint256 dripsBalBefore = token.balanceOf(address(drips));
        (uint128 prinBefore, uint128 liqBefore, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));

        vm.prank(address(drips));
        yieldManager.dripsReturn(aliceAcct, IERC20(address(token)), returnAmt);

        (uint128 prinAfter, uint128 liqAfter, ) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));

        assertEq(prinBefore - prinAfter, returnAmt, "principal dropped by return amount");
        assertEq(liqBefore  - liqAfter,  returnAmt, "liquid dropped by return amount");
        assertEq(token.balanceOf(address(drips)) - dripsBalBefore, returnAmt, "drips received tokens");
    }

    /// Full completeForceWithdrawal happy path:
    ///   deposit → positionOpen → dripsForceWithdraw → strategy.forceWithdraw
    ///   Assert position reduced, investedBalance reduced.
    function test_complete_force_withdrawal_happy_path() public {
        uint256 deposit = 100e6;
        _mintForAdmin(deposit);
        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        // Snapshot before
        (, , uint128 invBefore) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (, uint128 posBefore, ) =
            yieldManager.getPosition(aliceAcct, IERC20(address(token)), address(strategy));
        assertEq(invBefore, deposit, "invested == deposit before force withdrawal");
        assertEq(posBefore, deposit, "position == deposit before force withdrawal");

        // Create pending withdrawal (as drips)
        vm.prank(address(drips));
        yieldManager.dripsForceWithdraw(
            // deposit fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), uint128(deposit), charlie
        );

        uint256 charlieBalBefore = token.balanceOf(charlie);

        // Complete via strategy (mirrors the real forceCollect flow)
        // deposit fits in uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        strategy.forceWithdraw(address(yieldManager), charlieAcct, uint128(deposit), "");

        // Position and investedBalance reduced
        (, , uint128 invAfter) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        (, uint128 posAfter, ) =
            yieldManager.getPosition(aliceAcct, IERC20(address(token)), address(strategy));
        assertEq(invAfter, 0, "invested == 0 after full force withdrawal");
        assertEq(posAfter, 0, "position == 0 after full force withdrawal");

        // Charlie received tokens
        assertEq(token.balanceOf(charlie) - charlieBalBefore, deposit, "Charlie receives withdrawn tokens");
    }

    // ═══════════════════════════════════════════════════════════════════════════

    /// A second dripsForceWithdraw for the same recipient accountId while a withdrawal
    /// is already pending must revert with WithdrawalPending.
    function test_position_open_while_withdrawal_pending() public {
        uint256 deposit = 200e6;
        _mintForAdmin(deposit);
        bytes memory stratData = abi.encode(address(token));

        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), deposit);
        yieldManager.positionOpen(aliceAcct, IERC20(address(token)), address(strategy), deposit, stratData);

        // First pending withdrawal for charlieAcct
        vm.prank(address(drips));
        yieldManager.dripsForceWithdraw(
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), uint128(100e6), charlie
        );

        // Second call for the same recipient accountId must revert
        vm.prank(address(drips));
        vm.expectRevert(YieldManager.WithdrawalPending.selector);
        yieldManager.dripsForceWithdraw(
            aliceAcct, charlieAcct, IERC20(address(token)), address(strategy), uint128(50e6), charlie
        );
    }
}
