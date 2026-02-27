// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {IStablecoinDex} from "../interfaces/IStablecoinDex.sol";

/// @title IYieldStrategy
/// @notice Interface from YieldManager that all strategies must implement
interface IYieldStrategy {
    function invest(uint256 amount, bytes calldata strategyData)
        external
        returns (bytes memory positionData);

    function withdraw(bytes calldata positionData, uint256 amount, bytes calldata strategyData)
        external
        returns (uint256 withdrawn);
}

/// @title IYieldManagerForStrategy
/// @notice Minimal interface for force withdrawal completion
interface IYieldManagerForStrategy {
    struct WithdrawalState {
        uint256 accountId;
        address strategy;
        IERC20 token;
        uint128 amount;
        address transferTo;
        bool consumed;
    }

    function getWithdrawalState(uint256 accountId) external view returns (WithdrawalState memory);
    function completeForceWithdrawal(uint256 accountId, address strategy, IERC20 token, uint128 amount) external returns (uint128);
}

/// @title TempoDEXStrategy
/// @notice Yield strategy that places flip orders on Tempo's native stablecoin DEX
/// @dev Universal strategy - one deployment serves all YieldManager instances
/// @dev Flow:
///   1. AI agent reads DEX orderbook off-chain (quotes, tick levels, spreads)
///   2. AI agent encodes optimal params as strategyData
///   3. YieldManager calls invest() with tokens + strategyData
///   4. Strategy places flip order on DEX → captures spread as yield
///   5. On withdraw, strategy cancels order → collects settled funds → returns to YieldManager
contract TempoDEXStrategy is IYieldStrategy {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    //                                ERRORS
    // ═══════════════════════════════════════════════════════════════════════════

    error NotYieldManager();
    error InsufficientAmount();
    error OrderStillActive();

    // ═══════════════════════════════════════════════════════════════════════════
    //                              CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Tempo DEX contract address (protocol-level, same on all networks)
    address public constant DEX = 0xDEc0000000000000000000000000000000000000;

    // ═══════════════════════════════════════════════════════════════════════════
    //                               STORAGE
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice The YieldManager that deployed/uses this strategy
    address public immutable yieldManager;

    // ═══════════════════════════════════════════════════════════════════════════
    //                               EVENTS
    // ═══════════════════════════════════════════════════════════════════════════

    event FlipOrderPlaced(
        uint128 indexed orderId,
        address indexed token,
        uint128 amount,
        int16 tick,
        int16 flipTick,
        bool isBid
    );

    event OrderCancelled(uint128 indexed orderId, uint256 withdrawn);

    event ForceWithdrawal(uint256 indexed accountId, uint128 amount);

    // ═══════════════════════════════════════════════════════════════════════════
    //                            INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    constructor(address _yieldManager) {
        yieldManager = _yieldManager;
    }

    modifier onlyYieldManager() {
        if (msg.sender != yieldManager) revert NotYieldManager();
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                          CORE: INVEST
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Place a flip order on Tempo DEX
    /// @param amount Amount of tokens to invest
    /// @param strategyData Encoded params: (address token, int16 tick, int16 flipTick, bool isBid)
    /// @return positionData Encoded: (uint128 orderId, address token, uint128 amount, int16 tick, int16 flipTick, bool isBid)
    function invest(uint256 amount, bytes calldata strategyData)
        external
        override
        onlyYieldManager
        returns (bytes memory positionData)
    {
        // Decode strategy params (computed off-chain by AI agent)
        (
            address token,
            int16 tick,
            int16 flipTick,
            bool isBid
        ) = abi.decode(strategyData, (address, int16, int16, bool));

        // Approve DEX to spend tokens
        IERC20(token).safeApprove(DEX, amount);

        // Place flip order on Tempo DEX
        uint128 orderId = IStablecoinDex(DEX).placeFlip(
            token,
            uint128(amount),
            isBid,
            tick,
            flipTick
        );

        emit FlipOrderPlaced(orderId, token, uint128(amount), tick, flipTick, isBid);

        // Return position data for YieldManager to store
        positionData = abi.encode(orderId, token, uint128(amount), tick, flipTick, isBid);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                          CORE: WITHDRAW
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Cancel flip order and return funds + any captured spread
    /// @param positionData Encoded position from invest()
    /// @param amount Amount to withdraw (unused - we always close full position)
    /// @param strategyData Unused for withdrawal
    /// @return withdrawn Total amount returned (principal + yield from spread)
    function withdraw(bytes calldata positionData, uint256 amount, bytes calldata strategyData)
        external
        override
        onlyYieldManager
        returns (uint256 withdrawn)
    {
        (
            uint128 orderId,
            address token,
            uint128 originalAmount,
            ,  // tick
            ,  // flipTick
               // isBid
        ) = abi.decode(positionData, (uint128, address, uint128, int16, int16, bool));

        // Check order state - it may be partially/fully filled
        IStablecoinDex.Order memory order = IStablecoinDex(DEX).getOrder(orderId);

        // Cancel the order (returns unfilled portion to DEX balance)
        if (order.remaining > 0) {
            IStablecoinDex(DEX).cancel(orderId);
        }

        // Check our DEX balance (filled amount settles here + cancelled remainder)
        uint128 dexBalance = IStablecoinDex(DEX).balanceOf(address(this), token);

        // Withdraw everything from DEX to this contract
        if (dexBalance > 0) {
            IStablecoinDex(DEX).withdraw(token, dexBalance);
        }

        // Total withdrawn = whatever we got back (principal + spread profit)
        withdrawn = IERC20(token).balanceOf(address(this));

        // Transfer everything back to YieldManager
        if (withdrawn > 0) {
            IERC20(token).safeTransfer(yieldManager, withdrawn);
        }

        emit OrderCancelled(orderId, withdrawn);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                       FORCE WITHDRAW (CLAWBACK)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Emergency withdrawal for recipient clawback
    /// @dev Called when a stream recipient needs funds that are invested
    /// @dev Reads withdrawal state from YieldManager, executes, completes
    /// @param yieldManagerAddr The YieldManager address
    /// @param accountId The account ID requesting withdrawal
    /// @param amount Amount to force withdraw
    /// @param strategyData Encoded position data to know which order to cancel
    function forceWithdraw(
        address yieldManagerAddr,
        uint256 accountId,
        uint128 amount,
        bytes calldata strategyData
    ) external {
        // Read withdrawal state from YieldManager
        IYieldManagerForStrategy.WithdrawalState memory state =
            IYieldManagerForStrategy(yieldManagerAddr).getWithdrawalState(accountId);

        // Decode the position to get the orderId
        (
            uint128 orderId,
            address token,
            ,  // originalAmount
            ,  // tick
            ,  // flipTick
               // isBid
        ) = abi.decode(strategyData, (uint128, address, uint128, int16, int16, bool));

        // Cancel order on DEX
        IStablecoinDex.Order memory order = IStablecoinDex(DEX).getOrder(orderId);
        if (order.remaining > 0) {
            IStablecoinDex(DEX).cancel(orderId);
        }

        // Withdraw from DEX
        uint128 dexBalance = IStablecoinDex(DEX).balanceOf(address(this), token);
        if (dexBalance > 0) {
            IStablecoinDex(DEX).withdraw(token, dexBalance);
        }

        // Approve YieldManager to pull the funds
        IERC20(token).safeApprove(yieldManagerAddr, amount);

        // Complete the force withdrawal in YieldManager
        IYieldManagerForStrategy(yieldManagerAddr).completeForceWithdrawal(
            accountId,
            address(this),
            state.token,
            amount
        );

        emit ForceWithdrawal(accountId, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //                           VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Check if an order is still active on the DEX
    function isOrderActive(uint128 orderId) external view returns (bool) {
        IStablecoinDex.Order memory order = IStablecoinDex(DEX).getOrder(orderId);
        return order.remaining > 0;
    }

    /// @notice Get the current state of a position's order
    function getOrderState(uint128 orderId) external view returns (
        uint128 remaining,
        uint128 originalAmount,
        bool isFilled,
        bool isFlip,
        int16 tick,
        int16 flipTick
    ) {
        IStablecoinDex.Order memory order = IStablecoinDex(DEX).getOrder(orderId);
        remaining = order.remaining;
        originalAmount = order.amount;
        isFilled = order.remaining == 0;
        isFlip = order.isFlip;
        tick = order.tick;
        flipTick = order.flipTick;
    }

    /// @notice Get DEX balance for this strategy
    function getDexBalance(address token) external view returns (uint128) {
        return IStablecoinDex(DEX).balanceOf(address(this), token);
    }
}
