// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

import {ISnarkVerifier} from "./ISnarkVerifier.sol";

contract Groth16Verifier is ISnarkVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant ALPHAX  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant ALPHAY  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant BETAX1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant BETAX2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant BETAY1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant BETAY2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant GAMMAX1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant GAMMAX2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant GAMMAY1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant GAMMAY2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant DELTAX1 = 6111644483196607777868706770739399632129085381744727350234537487631259557786;
    uint256 constant DELTAX2 = 19058993459412759925121012524017295974751566652512172212332856744145806147126;
    uint256 constant DELTAY1 = 7436768171814748401772658267118466786714530213158064848933333415922927942645;
    uint256 constant DELTAY2 = 7944235923673332790711496829443580154302924613823527975018153193899962878715;


    uint256 constant IC0X = 4766880346789014725015772463658194312069073193740259621109819349902077877045;
    uint256 constant IC0Y = 1885236234593606420735940614693559581971036858058201878672453118248619029336;

    uint256 constant IC1X = 20965347267329500085745325833066792349795195205978069077533079797563190552713;
    uint256 constant IC1Y = 1175888801072676382912552928303489853156743328681345488369333675346493550214;

    uint256 constant IC2X = 19455405531269846384801032228721592056785015766664285724163322707609495682987;
    uint256 constant IC2Y = 15173725403985234499609389481358018603321130311049583205432546733570155810522;

    uint256 constant IC3X = 21328538250729830915433717770172307538061445671319836923060147645275528987119;
    uint256 constant IC3Y = 1194497974065158954320057748092289505037667529284374192138449692651359863393;

    uint256 constant IC4X = 17398143254635022432556590007491709475123124336718267984775161208722667378630;
    uint256 constant IC4Y = 8442909131317332039246184256064875632421199063377591662507908846473324049103;

    uint256 constant IC5X = 6690120482000535983942548322557124870133592367838231201790499803054761793585;
    uint256 constant IC5Y = 9973119108557249994660238318932308788923956552858913058736716028270751855129;

    uint256 constant IC6X = 12069917594445595689685068563758869935748335915048991567225382188141440145300;
    uint256 constant IC6Y = 9593004212399671908432291821841115694398260236163395232518354962796950981474;

    uint256 constant IC7X = 362506419935248688076781156966949706260567366855342360985390543775829203761;
    uint256 constant IC7Y = 1994856251916858786833034331299512823062740975261353678925886688702361932572;


    // Memory data
    uint16 constant P_VK = 0;
    uint16 constant P_PAIRING = 128;

    uint16 constant P_LAST_MEM = 896;

    function verifyProof(uint256[2] calldata _pA, uint256[2][2] calldata _pB, uint256[2] calldata _pC, uint256[7] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _P_PAIRING := add(pMem, P_PAIRING)
                let _P_VK := add(pMem, P_VK)

                mstore(_P_VK, IC0X)
                mstore(add(_P_VK, 32), IC0Y)

                // Compute the linear combination vk_x

                g1_mulAccC(_P_VK, IC1X, IC1Y, calldataload(add(pubSignals, 0)))

                g1_mulAccC(_P_VK, IC2X, IC2Y, calldataload(add(pubSignals, 32)))

                g1_mulAccC(_P_VK, IC3X, IC3Y, calldataload(add(pubSignals, 64)))

                g1_mulAccC(_P_VK, IC4X, IC4Y, calldataload(add(pubSignals, 96)))

                g1_mulAccC(_P_VK, IC5X, IC5Y, calldataload(add(pubSignals, 128)))

                g1_mulAccC(_P_VK, IC6X, IC6Y, calldataload(add(pubSignals, 160)))

                g1_mulAccC(_P_VK, IC7X, IC7Y, calldataload(add(pubSignals, 192)))


                // -A
                mstore(_P_PAIRING, calldataload(pA))
                mstore(add(_P_PAIRING, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_P_PAIRING, 64), calldataload(pB))
                mstore(add(_P_PAIRING, 96), calldataload(add(pB, 32)))
                mstore(add(_P_PAIRING, 128), calldataload(add(pB, 64)))
                mstore(add(_P_PAIRING, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_P_PAIRING, 192), ALPHAX)
                mstore(add(_P_PAIRING, 224), ALPHAY)

                // beta2
                mstore(add(_P_PAIRING, 256), BETAX1)
                mstore(add(_P_PAIRING, 288), BETAX2)
                mstore(add(_P_PAIRING, 320), BETAY1)
                mstore(add(_P_PAIRING, 352), BETAY2)

                // vk_x
                mstore(add(_P_PAIRING, 384), mload(add(pMem, P_VK)))
                mstore(add(_P_PAIRING, 416), mload(add(pMem, add(P_VK, 32))))


                // gamma2
                mstore(add(_P_PAIRING, 448), GAMMAX1)
                mstore(add(_P_PAIRING, 480), GAMMAX2)
                mstore(add(_P_PAIRING, 512), GAMMAY1)
                mstore(add(_P_PAIRING, 544), GAMMAY2)

                // C
                mstore(add(_P_PAIRING, 576), calldataload(pC))
                mstore(add(_P_PAIRING, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_P_PAIRING, 640), DELTAX1)
                mstore(add(_P_PAIRING, 672), DELTAX2)
                mstore(add(_P_PAIRING, 704), DELTAY1)
                mstore(add(_P_PAIRING, 736), DELTAY2)


                let success := staticcall(sub(gas(), 2000), 8, _P_PAIRING, 768, _P_PAIRING, 0x20)

                isOk := and(success, mload(_P_PAIRING))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, P_LAST_MEM))

            // Validate that all evaluations ∈ F

            checkField(calldataload(add(_pubSignals, 0)))

            checkField(calldataload(add(_pubSignals, 32)))

            checkField(calldataload(add(_pubSignals, 64)))

            checkField(calldataload(add(_pubSignals, 96)))

            checkField(calldataload(add(_pubSignals, 128)))

            checkField(calldataload(add(_pubSignals, 160)))

            checkField(calldataload(add(_pubSignals, 192)))


            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
