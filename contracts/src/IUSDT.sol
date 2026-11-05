// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/// EIP-3009 functions Settle uses. The token also has a `bytes signature` overload of
/// receiveWithAuthorization; we use the (v, r, s) one, selector 0xef55bec6.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

/// Test USDT on Whitechain Sepolia: 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, 6 decimals.
interface IUSDT is IERC20, IERC20Permit, IERC3009 { }
