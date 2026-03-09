// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal interface for PancakeSwap V3 NonfungiblePositionManager
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);
}

/// @notice Minimal interface for PancakeSwap V3 Factory
interface IPancakeV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @notice Interface for YieldManager contract
interface IYieldManager {
    struct WithdrawalState {
        uint256 senderAccountId;
        uint256 accountId;
        address strategy;
        IERC20 token;
        uint128 amount;
        address transferTo;
        bool consumed;
    }

    function getWithdrawalState(uint256 accountId) external view returns (WithdrawalState memory);
    function getPosition(uint256 senderAccountId, IERC20 token, address strategy)
        external
        view
        returns (address strategyAddr, uint128 amount, bytes memory positionData);
    function completeForceWithdrawal(
        uint256 accountId,
        address strategy,
        IERC20 token,
        uint128 amount
    ) external returns (uint128 principalWithdrawn);
}

/// @title PancakeSwapV3Strategy
/// @notice Yield strategy for PancakeSwap V3 concentrated liquidity provision on BSC
/// @dev Adapted from UniswapV4Strategy, uses V3 NonfungiblePositionManager interface
contract PancakeSwapV3Strategy {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════════
    //                                   ERRORS
    // ═══════════════════════════════════════════════════════════════════════════════

    error InsufficientBalance();
    error InvalidPosition();
    error TokensNotReceived();
    error PoolDoesNotExist();

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              STORAGE & TYPES
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Position data stored in YieldManager
    struct PositionData {
        uint256 tokenId;
        address token0;
        address token1;
        address depositToken;
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        uint24 fee;
        uint256 amount0;
        uint256 amount1;
    }

    address public immutable YIELD_MANAGER;
    INonfungiblePositionManager public immutable POSITION_MANAGER;
    IPancakeV3Factory public immutable FACTORY;

    // ═══════════════════════════════════════════════════════════════════════════════
    //                                  EVENTS
    // ═══════════════════════════════════════════════════════════════════════════════

    event PositionCreated(
        uint256 indexed tokenId,
        uint128 liquidity,
        int24 tickLower,
        int24 tickUpper
    );
    event PositionWithdrawn(
        uint256 indexed tokenId,
        uint128 liquidityRemoved,
        uint256 amount0,
        uint256 amount1
    );

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @param _yieldManager Address of the YieldManager contract
    /// @param _positionManager BSC mainnet: 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
    /// @param _factory BSC mainnet: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865
    constructor(
        address _yieldManager,
        address _positionManager,
        address _factory
    ) {
        YIELD_MANAGER = _yieldManager;
        POSITION_MANAGER = INonfungiblePositionManager(_positionManager);
        FACTORY = IPancakeV3Factory(_factory);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                              MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════════

    modifier onlyYieldManager() {
        _onlyYieldManager();
        _;
    }

    function _onlyYieldManager() internal view {
        require(msg.sender == YIELD_MANAGER, "Only YieldManager");
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           STRATEGY IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Invest - provide single-sided liquidity to PancakeSwap V3
    /// @param amount Amount of tokens to invest
    /// @param strategyData Encoded: (token0, token1, tickLower, tickUpper, isToken0, fee)
    /// @return positionData Encoded position information
    function invest(
        uint256 amount,
        bytes calldata strategyData
    ) external onlyYieldManager returns (bytes memory positionData) {
        PositionData memory position;
        {
            bool isToken0;
            (
                position.token0,
                position.token1,
                position.tickLower,
                position.tickUpper,
                isToken0,
                position.fee
            ) = abi.decode(strategyData, (address, address, int24, int24, bool, uint24));

            require(position.token0 < position.token1, "token0 must be < token1");

            position.depositToken = isToken0 ? position.token0 : position.token1;

            uint256 balance = IERC20(position.depositToken).balanceOf(address(this));
            if (balance < amount) revert TokensNotReceived();

            address pool = FACTORY.getPool(position.token0, position.token1, position.fee);
            if (pool == address(0)) revert PoolDoesNotExist();

            if (isToken0) {
                position.amount0 = amount;
                position.amount1 = 0;
            } else {
                position.amount0 = 0;
                position.amount1 = amount;
            }
        }

        IERC20(position.depositToken).safeApprove(address(POSITION_MANAGER), amount);

        (position.tokenId, position.liquidity) = _mintV3Position(
            position.token0, position.token1, position.fee, position.tickLower, position.tickUpper, position.amount0, position.amount1
        );

        emit PositionCreated(position.tokenId, position.liquidity, position.tickLower, position.tickUpper);

        return abi.encode(position);
    }

    /// @notice Withdraw - remove liquidity from PancakeSwap V3
    /// @param positionData Encoded position information
    /// @param amount Amount to withdraw (used to calculate proportional liquidity)
    /// @return withdrawn Actual amount withdrawn in original deposit token
    function withdraw(
        bytes calldata positionData,
        uint256 amount,
        bytes calldata /* strategyData */
    ) external onlyYieldManager returns (uint256 withdrawn) {
        PositionData memory position = abi.decode(positionData, (PositionData));

        uint256 totalDeposited = position.amount0 + position.amount1;
        if (totalDeposited == 0) return 0;

        // result bounded by position.liquidity
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 liquidityToRemove = uint128((uint256(position.liquidity) * amount) / totalDeposited);
        if (liquidityToRemove > position.liquidity) {
            liquidityToRemove = position.liquidity;
        }

        // Track balance before
        uint256 balanceBefore = IERC20(position.depositToken).balanceOf(address(this));

        // Decrease liquidity
        POSITION_MANAGER.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: position.tokenId,
                liquidity: liquidityToRemove,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 60
            })
        );

        // Collect tokens
        POSITION_MANAGER.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: position.tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 balanceAfter = IERC20(position.depositToken).balanceOf(address(this));
        withdrawn = balanceAfter - balanceBefore;

        emit PositionWithdrawn(position.tokenId, liquidityToRemove, 0, 0);

        // Transfer back to YieldManager
        if (withdrawn > 0) {
            IERC20(position.depositToken).safeTransfer(YIELD_MANAGER, withdrawn);
        }

        return withdrawn;
    }

    /// @notice Force withdraw - consumes withdrawal state from force collect flow
    function forceWithdraw(
        address yieldManagerAddr,
        uint256 accountId,
        uint128 amount,
        bytes calldata /* strategyData */
    ) external {
        IYieldManager.WithdrawalState memory state = IYieldManager(yieldManagerAddr)
            .getWithdrawalState(accountId);

        require(state.amount == amount, "Amount mismatch");
        require(state.strategy == address(this), "Wrong strategy");

        (, , bytes memory positionDataBytes) = IYieldManager(yieldManagerAddr).getPosition(
            state.senderAccountId,
            state.token,
            address(this)
        );

        PositionData memory position = abi.decode(positionDataBytes, (PositionData));

        uint256 withdrawn = _executeWithdrawal(positionDataBytes, amount);

        IERC20(position.depositToken).safeApprove(yieldManagerAddr, withdrawn);

        IYieldManager(yieldManagerAddr).completeForceWithdrawal(
            accountId,
            address(this),
            state.token,
            // withdrawn is the balance, fits in uint128
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128(withdrawn)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    /// @notice Check if a pool exists for the given token pair and fee
    function poolExists(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (bool) {
        return FACTORY.getPool(tokenA, tokenB, fee) != address(0);
    }

    /// @notice Get position details
    function getPositionDetails(
        bytes calldata positionData
    )
        external
        pure
        returns (
            uint256 tokenId,
            address token0,
            address token1,
            address depositToken,
            uint128 liquidity,
            int24 tickLower,
            int24 tickUpper,
            uint24 fee,
            uint256 amount0,
            uint256 amount1
        )
    {
        PositionData memory position = abi.decode(positionData, (PositionData));
        return (
            position.tokenId,
            position.token0,
            position.token1,
            position.depositToken,
            position.liquidity,
            position.tickLower,
            position.tickUpper,
            position.fee,
            position.amount0,
            position.amount1
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    //                           INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════════════

    function _mintV3Position(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0,
        uint256 amount1
    ) internal returns (uint256 tokenId, uint128 liquidity) {
        (tokenId, liquidity, , ) = POSITION_MANAGER.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 60
            })
        );
    }

    function _executeWithdrawal(
        bytes memory positionData,
        uint256 amount
    ) internal returns (uint256 withdrawn) {
        PositionData memory position = abi.decode(positionData, (PositionData));

        uint256 totalDeposited = position.amount0 + position.amount1;
        if (totalDeposited == 0) return 0;

        // result bounded by position.liquidity
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 liquidityToRemove = uint128((uint256(position.liquidity) * amount) / totalDeposited);
        if (liquidityToRemove > position.liquidity) {
            liquidityToRemove = position.liquidity;
        }

        uint256 balanceBefore = IERC20(position.depositToken).balanceOf(address(this));

        POSITION_MANAGER.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: position.tokenId,
                liquidity: liquidityToRemove,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 60
            })
        );

        POSITION_MANAGER.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: position.tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 balanceAfter = IERC20(position.depositToken).balanceOf(address(this));
        withdrawn = balanceAfter - balanceBefore;

        emit PositionWithdrawn(position.tokenId, liquidityToRemove, 0, 0);
    }
}
