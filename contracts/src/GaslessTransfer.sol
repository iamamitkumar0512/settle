// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IUSDT } from "./IUSDT.sol";

/// Sends USDT for an account that holds no gas. The account signs one EIP-3009 authorization and
/// anyone may submit it. The submitter is paid `fee` USDT out of the amount for the gas they spent.
/// The recipient and the fee are inside the signed nonce, so a submitter can change neither.
/// USDT passes through within one transaction; this contract keeps no balance, no state and has
/// no owner.
contract GaslessTransfer {
    using SafeERC20 for IUSDT;

    /// One transfer, as the sender authorized it.
    struct Transfer {
        address from;
        address to;
        uint256 amount; // USDT taken from `from`, 6 decimals
        uint256 fee; // the part of `amount` paid to the submitter
        bytes32 salt; // makes each transfer unique
        uint256 validAfter; // unix seconds, as signed for the token
        uint256 validBefore;
    }

    IUSDT public immutable usdt;

    event Sent(
        address indexed from, address indexed to, address indexed submitter, uint256 amount, uint256 fee
    );

    error InvalidRecipient();
    error FeeTooLarge();

    constructor(IUSDT usdt_) {
        usdt = usdt_;
    }

    /// The EIP-3009 nonce the sender signs. It ties the signature to one recipient and one fee;
    /// the salt lets the same sender make the same transfer again later.
    function transferNonce(address to, uint256 fee, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode("SETTLE_TRANSFER", to, fee, salt));
    }

    /// Takes `amount` from the sender, sends `amount - fee` to the recipient and `fee` to the
    /// submitter.
    ///
    /// receiveWithAuthorization requires msg.sender == to, so only this contract can use the
    /// signature, and it can only use it with the recipient and fee the sender signed.
    function sendWithAuthorization(Transfer calldata t, uint8 v, bytes32 r, bytes32 s) external {
        if (t.to == address(0) || t.to == address(this)) revert InvalidRecipient();
        if (t.fee >= t.amount) revert FeeTooLarge();

        usdt.receiveWithAuthorization(
            t.from,
            address(this),
            t.amount,
            t.validAfter,
            t.validBefore,
            transferNonce(t.to, t.fee, t.salt),
            v,
            r,
            s
        );
        usdt.safeTransfer(t.to, t.amount - t.fee);
        if (t.fee > 0) usdt.safeTransfer(msg.sender, t.fee);

        emit Sent(t.from, t.to, msg.sender, t.amount, t.fee);
    }
}
