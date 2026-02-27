// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {IERC20} from "openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SplitsReceiver} from "./Splits.sol";
import {StreamReceiver} from "./Streams.sol";
import {AccountMetadata} from "./DripsFacetB.sol";

/// @notice DripsRouter — single entry point that delegates to FacetA or FacetB.
/// Uses delegatecall so both facets share this contract's storage.
/// This contract is deployed behind ManagedProxy just like the old DripsCore.
contract DripsRouter {
    address public immutable facetA;
    address public immutable facetB;

    constructor(address facetA_, address facetB_) {
        facetA = facetA_;
        facetB = facetB_;
    }

    /// @dev Routes all calls to the appropriate facet via delegatecall.
    /// FacetA: streams, drivers, balances, withdraw, receiveStreams, setStreams, streamsState
    /// FacetB: splits, give, collect, forceCollect, setSplits, metadata, splittable, collectable
    /// Admin/Managed functions go to FacetA (it has the full Managed inheritance).
    fallback() external payable {
        address target = _route(msg.sig);
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}

    function _route(bytes4 sig) internal view returns (address) {
        // FacetB selectors: splits/collect/give/metadata
        if (
            sig == 0xf98e7e1d || // splittable(uint256,address)
            sig == 0x0ea2063a || // split(uint256,address,(uint256,uint32)[])
            sig == 0x1ec026c8 || // collectable(uint256,address)
            sig == 0x8d3c100a || // collect(uint256,address)
            sig == 0xbe1ca322 || // forceCollect(uint256,address,address,address,address)
            sig == 0xd9e01070 || // give(uint256,uint256,address,uint128)
            sig == 0x02cfc753 || // setSplits(uint256,(uint256,uint32)[])
            sig == 0x69610257 || // emitAccountMetadata(uint256,(bytes32,bytes)[])
            sig == 0xf11d5139 || // MAX_SPLITS_RECEIVERS()
            sig == 0xa69aff3c    // TOTAL_SPLITS_WEIGHT()
        ) {
            return facetB;
        }
        // Everything else goes to FacetA (streams, drivers, balances, admin, managed)
        return facetA;
    }
}
