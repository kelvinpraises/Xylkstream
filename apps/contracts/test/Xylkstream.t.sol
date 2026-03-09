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

// ─── Test ERC20 ───
contract TestToken is ERC20 {
    constructor() ERC20("Test", "TST") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─── Simple test strategy ───
contract TestStrategy is IYieldStrategy {
    address public yieldManager;
    IERC20 public activeToken;

    constructor(address _ym) {
        yieldManager = _ym;
    }

    function invest(uint256 amount, bytes calldata strategyData)
        external
        override
        returns (bytes memory positionData)
    {
        if (strategyData.length > 0) {
            activeToken = abi.decode(strategyData, (IERC20));
        }
        positionData = abi.encode(amount);
    }

    function withdraw(bytes calldata, uint256 amount, bytes calldata)
        external
        override
        returns (uint256 withdrawn)
    {
        uint256 bal = activeToken.balanceOf(address(this));
        if (bal > 0) {
            require(activeToken.transfer(msg.sender, bal), "transfer failed");
        }
        withdrawn = bal;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//                           MAIN TEST CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

contract XylkstreamTest is Test {
    TestToken token;
    IDrips drips;
    Caller caller;
    AddressDriver driver;
    YieldManager yieldManager;
    TestStrategy strategy;

    address admin = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC0C);

    uint32 driverId;

    // Pre-computed account IDs
    uint256 aliceAcct;
    uint256 bobAcct;
    uint256 charlieAcct;

    function setUp() public {
        // Deploy test token
        token = new TestToken();

        // Deploy facets
        DripsFacetA facetA = new DripsFacetA(10);
        DripsFacetB facetB = new DripsFacetB();

        // Deploy router
        DripsRouter router = new DripsRouter(address(facetA), address(facetB), 0, admin);

        // Deploy ManagedProxy wrapping the router
        drips = IDrips(address(new ManagedProxy(Managed(address(router)), admin, "")));

        // Deploy Caller
        caller = new Caller();

        // Register driver ID
        driverId = drips.registerDriver(admin);

        // Deploy AddressDriver
        AddressDriver driverLogic = new AddressDriver(drips, address(caller), driverId);
        driver = AddressDriver(address(new ManagedProxy(driverLogic, admin, "")));
        drips.updateDriverAddress(driverId, address(driver));

        // Deploy YieldManager + strategy
        yieldManager = new YieldManager(address(drips));
        strategy = new TestStrategy(address(yieldManager));

        // Pre-compute account IDs
        aliceAcct = driver.calcAccountId(alice);
        bobAcct = driver.calcAccountId(bob);
        charlieAcct = driver.calcAccountId(charlie);

        // Fund test users
        token.mint(alice, 10_000e6);
        token.mint(bob, 10_000e6);
        token.mint(charlie, 10_000e6);

        // Approvals to AddressDriver
        vm.prank(alice);
        token.approve(address(driver), type(uint256).max);
        vm.prank(bob);
        token.approve(address(driver), type(uint256).max);
        vm.prank(charlie);
        token.approve(address(driver), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                          TEST: GIVE & COLLECT
    // ═══════════════════════════════════════════════════════════════════════════

    function test_give_and_collect() public {
        uint128 giveAmount = 100e6;

        // Alice gives to Bob
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), giveAmount);

        // Check splittable
        uint128 splittable = drips.splittable(bobAcct, IERC20(address(token)));
        assertEq(splittable, giveAmount, "Splittable should equal give amount");

        // Split (no receivers -> all goes to collectable)
        SplitsReceiver[] memory noSplits = new SplitsReceiver[](0);
        drips.split(bobAcct, IERC20(address(token)), noSplits);

        // Check collectable
        uint128 collectable = drips.collectable(bobAcct, IERC20(address(token)));
        assertEq(collectable, giveAmount, "Collectable should equal give amount");

        // Bob collects
        uint256 bobBalBefore = token.balanceOf(bob);
        vm.prank(bob);
        driver.collect(IERC20(address(token)), bob);
        uint256 bobBalAfter = token.balanceOf(bob);

        assertEq(bobBalAfter - bobBalBefore, giveAmount, "Bob should receive the given amount");
    }

    function test_give_zero_amount() public {
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), 0);

        uint128 splittable = drips.splittable(bobAcct, IERC20(address(token)));
        assertEq(splittable, 0);
    }

    function test_give_multiple_times() public {
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), 50e6);

        vm.prank(charlie);
        driver.give(bobAcct, IERC20(address(token)), 75e6);

        uint128 splittable = drips.splittable(bobAcct, IERC20(address(token)));
        assertEq(splittable, 125e6, "Splittable should be sum of both gives");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                          TEST: SPLITS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_splits() public {
        uint128 giveAmount = 1000e6;

        // Alice gives to Bob
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), giveAmount);

        // Bob sets splits: 30% to Charlie
        SplitsReceiver[] memory receivers = new SplitsReceiver[](1);
        receivers[0] = SplitsReceiver({
            accountId: charlieAcct,
            weight: 300_000 // 30% of TOTAL_SPLITS_WEIGHT (1_000_000)
        });

        vm.prank(bob);
        driver.setSplits(receivers);

        // Split Bob's funds
        drips.split(bobAcct, IERC20(address(token)), receivers);

        // Bob should have 70% collectable
        uint128 bobCollectable = drips.collectable(bobAcct, IERC20(address(token)));
        assertEq(bobCollectable, 700e6, "Bob should have 70%");

        // Charlie should have 30% splittable
        uint128 charlieSplittable = drips.splittable(charlieAcct, IERC20(address(token)));
        assertEq(charlieSplittable, 300e6, "Charlie should have 30%");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                          TEST: STREAMS
    // ═══════════════════════════════════════════════════════════════════════════

    function test_stream_setup_and_cancel() public {
        uint160 amtPerSec = uint160(1e6) * drips.AMT_PER_SEC_MULTIPLIER();
        StreamConfig config = StreamConfigImpl.create(1, amtPerSec, 0, 0);

        StreamReceiver[] memory newReceivers = new StreamReceiver[](1);
        newReceivers[0] = StreamReceiver({accountId: bobAcct, config: config});
        StreamReceiver[] memory noReceivers = new StreamReceiver[](0);

        int128 deposit = int128(uint128(500e6));

        // Alice sets up stream to Bob
        vm.prank(alice);
        int128 realDelta = driver.setStreams(
            IERC20(address(token)),
            noReceivers, deposit, newReceivers,
            0, 0, alice
        );
        assertEq(realDelta, deposit, "Balance delta should match deposit");

        // Verify stream state
        (,,, uint128 balance,) = drips.streamsState(aliceAcct, IERC20(address(token)));
        // deposit fits in uint128, safe cast to uint256 then to uint128
        // forge-lint: disable-next-line(unsafe-typecast)
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(balance, uint128(uint256(int256(deposit))), "Stream balance should match deposit");

        // Cancel stream
        vm.prank(alice);
        driver.setStreams(
            IERC20(address(token)),
            // balance fits in uint128, safe to cast to int128
            // forge-lint: disable-next-line(unsafe-typecast)
            newReceivers, -int128(balance), noReceivers,
            0, 0, alice
        );
    }

    function test_stream_and_receive() public {
        uint160 amtPerSec = uint160(1e6) * drips.AMT_PER_SEC_MULTIPLIER();
        StreamConfig config = StreamConfigImpl.create(1, amtPerSec, 0, 0);

        StreamReceiver[] memory newReceivers = new StreamReceiver[](1);
        newReceivers[0] = StreamReceiver({accountId: bobAcct, config: config});
        StreamReceiver[] memory noReceivers = new StreamReceiver[](0);

        // Alice starts streaming
        vm.prank(alice);
        driver.setStreams(
            IERC20(address(token)),
            noReceivers, int128(uint128(500e6)), newReceivers,
            0, 0, alice
        );

        // Fast forward 15 seconds (past 1 cycle of 10s)
        vm.warp(block.timestamp + 15);

        // Bob receives streams
        uint128 received = drips.receiveStreams(bobAcct, IERC20(address(token)), 100);
        assertGt(received, 0, "Bob should receive some streamed funds");

        // Split and collect
        SplitsReceiver[] memory noSplits = new SplitsReceiver[](0);
        drips.split(bobAcct, IERC20(address(token)), noSplits);

        uint256 bobBalBefore = token.balanceOf(bob);
        vm.prank(bob);
        driver.collect(IERC20(address(token)), bob);
        uint256 bobBalAfter = token.balanceOf(bob);
        assertGt(bobBalAfter, bobBalBefore, "Bob should have collected funds");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                     TEST: DRIVER REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    function test_driver_registration() public {
        uint32 nextId = drips.nextDriverId();
        uint32 newDriverId = drips.registerDriver(address(0x1234));
        assertEq(newDriverId, nextId);
        assertEq(drips.driverAddress(newDriverId), address(0x1234));
    }

    function test_account_id_calculation() public view {
        uint256 expected = (uint256(driverId) << 224) | uint160(alice);
        assertEq(aliceAcct, expected);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                     TEST: YIELD MANAGER
    // ═══════════════════════════════════════════════════════════════════════════

    function test_yield_manager_owner_deposit() public {
        uint256 depositAmt = 1000e6;
        token.approve(address(yieldManager), depositAmt);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), depositAmt);

        (uint128 principal, uint128 liquid, uint128 invested) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(principal, depositAmt, "Principal should match deposit");
        assertEq(liquid, depositAmt, "Liquid should match deposit");
        assertEq(invested, 0, "Invested should be 0");
    }

    function test_yield_manager_position_open_close() public {
        uint256 depositAmt = 1000e6;

        token.approve(address(yieldManager), depositAmt);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), depositAmt);

        // Open position (pass token address as strategyData so strategy knows)
        bytes memory stratData = abi.encode(address(token));
        yieldManager.positionOpen(
            aliceAcct,
            IERC20(address(token)),
            address(strategy),
            depositAmt,
            stratData
        );

        (uint128 principal, uint128 liquid, uint128 invested) =
            yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(liquid, 0, "Liquid should be 0 after investing");
        assertEq(invested, depositAmt, "Invested should match");
        assertEq(token.balanceOf(address(strategy)), depositAmt, "Strategy holds tokens");

        // Close position (strategy.withdraw transfers tokens back)
        yieldManager.positionClose(
            aliceAcct,
            IERC20(address(token)),
            address(strategy),
            ""
        );

        (principal, liquid, invested) = yieldManager.getBalances(aliceAcct, IERC20(address(token)));
        assertEq(principal, depositAmt);
        assertEq(liquid, depositAmt, "Liquid should be restored");
        assertEq(invested, 0, "Invested should be 0");
    }

    function test_yield_manager_not_authorized() public {
        vm.prank(alice);
        vm.expectRevert(YieldManager.NotAuthorized.selector);
        yieldManager.ownerDeposit(aliceAcct, IERC20(address(token)), 100);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                     TEST: COLLECT EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════════

    function test_collect_nothing() public {
        vm.prank(alice);
        uint128 amt = driver.collect(IERC20(address(token)), alice);
        assertEq(amt, 0, "Should collect 0 when nothing to collect");
    }

    function test_cannot_collect_for_other() public {
        // Give to Bob
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), 100e6);

        // Split
        SplitsReceiver[] memory noSplits = new SplitsReceiver[](0);
        drips.split(bobAcct, IERC20(address(token)), noSplits);

        // Alice tries to collect — gets 0 because her account has nothing
        vm.prank(alice);
        uint128 amt = driver.collect(IERC20(address(token)), alice);
        assertEq(amt, 0, "Alice should not be able to collect Bob's funds");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                     TEST: PROTOCOL BALANCES
    // ═══════════════════════════════════════════════════════════════════════════

    function test_protocol_balances_after_give() public {
        vm.prank(alice);
        driver.give(bobAcct, IERC20(address(token)), 100e6);

        (uint128 streamsBalance, uint128 splitsBalance) = drips.balances(IERC20(address(token)));
        assertEq(splitsBalance, 100e6, "Splits balance should increase after give");
        assertEq(streamsBalance, 0, "Streams balance should be 0");
    }

    function test_protocol_balances_after_stream() public {
        uint160 amtPerSec = uint160(1e6) * drips.AMT_PER_SEC_MULTIPLIER();
        StreamConfig config = StreamConfigImpl.create(1, amtPerSec, 0, 0);

        StreamReceiver[] memory newReceivers = new StreamReceiver[](1);
        newReceivers[0] = StreamReceiver({accountId: bobAcct, config: config});
        StreamReceiver[] memory noReceivers = new StreamReceiver[](0);

        vm.prank(alice);
        driver.setStreams(
            IERC20(address(token)),
            noReceivers, int128(uint128(100e6)), newReceivers,
            0, 0, alice
        );

        (uint128 streamsBalance,) = drips.balances(IERC20(address(token)));
        assertEq(streamsBalance, 100e6, "Streams balance should match deposit");
    }
}
