// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IStablecoinDex
/// @notice Interface for Tempo's native stablecoin DEX
/// @dev Extracted from viem/tempo Abis.stablecoinDex
interface IStablecoinDex {
    // ═══════════════════════════════════════════════════════════════════════════
    //                              ORDERS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Place a limit order
    /// @param token Base token address
    /// @param amount Order amount
    /// @param isBid True for buy, false for sell
    /// @param tick Price tick
    /// @return orderId The new order ID
    function place(
        address token,
        uint128 amount,
        bool isBid,
        int16 tick
    ) external returns (uint128 orderId);

    /// @notice Place a flip order (auto-reverses when filled)
    /// @param token Base token address
    /// @param amount Order amount
    /// @param isBid True for buy, false for sell
    /// @param tick Entry price tick
    /// @param flipTick Exit price tick (order flips to this tick when filled)
    /// @return orderId The new order ID
    function placeFlip(
        address token,
        uint128 amount,
        bool isBid,
        int16 tick,
        int16 flipTick
    ) external returns (uint128 orderId);

    /// @notice Cancel an order
    /// @param orderId The order to cancel
    function cancel(uint128 orderId) external;

    // ═══════════════════════════════════════════════════════════════════════════
    //                              SWAPS
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Swap exact amount in
    function swapExactAmountIn(
        address tokenIn,
        address tokenOut,
        uint128 amountIn,
        uint128 minAmountOut
    ) external returns (uint128 amountOut);

    /// @notice Swap exact amount out
    function swapExactAmountOut(
        address tokenIn,
        address tokenOut,
        uint128 amountOut,
        uint128 maxAmountIn
    ) external returns (uint128 amountIn);

    // ═══════════════════════════════════════════════════════════════════════════
    //                              QUERIES
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Quote swap exact amount in
    function quoteSwapExactAmountIn(
        address tokenIn,
        address tokenOut,
        uint128 amountIn
    ) external view returns (uint128 amountOut);

    /// @notice Quote swap exact amount out
    function quoteSwapExactAmountOut(
        address tokenIn,
        address tokenOut,
        uint128 amountOut
    ) external view returns (uint128 amountIn);

    struct Order {
        uint128 orderId;
        address maker;
        bytes32 bookKey;
        bool isBid;
        int16 tick;
        uint128 amount;
        uint128 remaining;
        uint128 prev;
        uint128 next;
        bool isFlip;
        int16 flipTick;
    }

    /// @notice Get order details
    function getOrder(uint128 orderId) external view returns (Order memory);

    /// @notice Get tick level liquidity
    function getTickLevel(
        address base,
        int16 tick,
        bool isBid
    ) external view returns (uint128 head, uint128 tail, uint128 totalLiquidity);

    /// @notice Get DEX balance for a user
    function balanceOf(address user, address token) external view returns (uint128);

    /// @notice Withdraw settled funds from DEX
    function withdraw(address token, uint128 amount) external;

    /// @notice Minimum order amount
    // forge-lint: disable-next-line(mixed-case-function)
    function MIN_ORDER_AMOUNT() external pure returns (uint128);
}
