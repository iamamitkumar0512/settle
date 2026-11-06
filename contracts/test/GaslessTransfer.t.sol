// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { GaslessTransfer } from "../src/GaslessTransfer.sol";
import { IUSDT } from "../src/IUSDT.sol";

/// Runs against the REAL test USDT in a pinned fork, so the nonce binding and the
/// msg.sender == to guard are proven against the deployed token.
contract GaslessTransferTest is Test {
    IUSDT constant USDT = IUSDT(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PIN = 12304888;
    uint256 constant START_BALANCE = 500e6;
    uint256 constant AMOUNT = 120e6;
    uint256 constant FEE = 50_000; // 0.05 USDT

    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    GaslessTransfer transfer;

    uint256 senderPk = 0xA11CE;
    address sender;
    address recipient = makeAddr("recipient");
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");

    event Sent(
        address indexed from, address indexed to, address indexed submitter, uint256 amount, uint256 fee
    );

    function setUp() public {
        vm.createSelectFork("https://rpc.testnet.whitechain.io", PIN);
        transfer = new GaslessTransfer(USDT);
        sender = vm.addr(senderPk);
        deal(address(USDT), sender, START_BALANCE);
    }

    function _request(uint256 amount, uint256 fee) internal view returns (GaslessTransfer.Transfer memory) {
        return GaslessTransfer.Transfer({
            from: sender,
            to: recipient,
            amount: amount,
            fee: fee,
            salt: keccak256("transfer-1"),
            validAfter: 0,
            validBefore: block.timestamp + 1800
        });
    }

    function _sign(uint256 pk, GaslessTransfer.Transfer memory t)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 nonce = transfer.transferNonce(t.to, t.fee, t.salt);
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIVE_TYPEHASH, t.from, address(transfer), t.amount, t.validAfter, t.validBefore, nonce
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(pk, digest);
    }

    function _send(GaslessTransfer.Transfer memory t, address submitter) internal {
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        vm.prank(submitter);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    // ---------- Happy path ----------

    function test_Send_SplitsAmountBetweenRecipientAndSubmitter() public {
        _send(_request(AMOUNT, FEE), relayer);

        assertEq(USDT.balanceOf(sender), START_BALANCE - AMOUNT);
        assertEq(USDT.balanceOf(recipient), AMOUNT - FEE);
        assertEq(USDT.balanceOf(relayer), FEE);
        assertEq(USDT.balanceOf(address(transfer)), 0);
    }

    function test_Send_SenderNeedsNoGas() public {
        assertEq(sender.balance, 0);
        _send(_request(AMOUNT, FEE), relayer);
        assertEq(USDT.balanceOf(recipient), AMOUNT - FEE);
    }

    function test_Send_EmitsSent() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectEmit(true, true, true, true, address(transfer));
        emit Sent(sender, recipient, relayer, AMOUNT, FEE);
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_Send_ZeroFeePaysRecipientInFull() public {
        _send(_request(AMOUNT, 0), relayer);

        assertEq(USDT.balanceOf(recipient), AMOUNT);
        assertEq(USDT.balanceOf(relayer), 0);
    }

    function test_Send_AnyoneMaySubmitAndEarnsTheFee() public {
        _send(_request(AMOUNT, FEE), stranger);

        assertEq(USDT.balanceOf(recipient), AMOUNT - FEE);
        assertEq(USDT.balanceOf(stranger), FEE);
    }

    function test_Send_WholeBalance() public {
        _send(_request(START_BALANCE, FEE), relayer);

        assertEq(USDT.balanceOf(sender), 0);
        assertEq(USDT.balanceOf(recipient), START_BALANCE - FEE);
    }

    function test_Send_SameTransferAgainWithNewSalt() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        _send(t, relayer);
        t.salt = keccak256("transfer-2");
        _send(t, relayer);

        assertEq(USDT.balanceOf(recipient), 2 * (AMOUNT - FEE));
        assertEq(USDT.balanceOf(relayer), 2 * FEE);
    }

    function testFuzz_Send_NeverKeepsUsdt(uint256 amount, uint256 fee) public {
        amount = bound(amount, 1, START_BALANCE);
        fee = bound(fee, 0, amount - 1);
        _send(_request(amount, fee), relayer);

        assertEq(USDT.balanceOf(sender), START_BALANCE - amount);
        assertEq(USDT.balanceOf(recipient), amount - fee);
        assertEq(USDT.balanceOf(relayer), fee);
        assertEq(USDT.balanceOf(address(transfer)), 0);
    }

    // ---------- A submitter can't change what was signed ----------

    function test_RevertWhen_SubmitterChangesRecipient() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        t.to = stranger;

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(stranger);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SubmitterRaisesFee() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        t.fee = AMOUNT - 1;

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(stranger);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SubmitterRaisesAmount() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        t.amount = START_BALANCE;

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(stranger);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SubmitterChangesSender() public {
        deal(address(USDT), stranger, START_BALANCE);
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        t.from = stranger;

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SignedBySomeoneElse() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(0xB0B, t);

        vm.expectRevert(bytes("TetherToken: invalid signature"));
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    // ---------- A signature works once, in its window, through this contract only ----------

    function test_RevertWhen_Replayed() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        _send(t, relayer);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(bytes("TetherToken: auth invalid"));
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_Expired() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        vm.warp(t.validBefore);

        vm.expectRevert(bytes("TetherToken: auth expired"));
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SignatureSentStraightToToken() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);
        bytes32 nonce = transfer.transferNonce(t.to, t.fee, t.salt);

        vm.expectRevert(bytes("TetherToken: to != msg.sender"));
        vm.prank(stranger);
        USDT.receiveWithAuthorization(
            sender, address(transfer), AMOUNT, t.validAfter, t.validBefore, nonce, v, r, s
        );
    }

    // ---------- Input checks ----------

    function test_RevertWhen_FeeEqualsAmount() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, AMOUNT);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(GaslessTransfer.FeeTooLarge.selector);
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_FeeAboveAmount() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, AMOUNT + 1);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(GaslessTransfer.FeeTooLarge.selector);
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_RecipientIsZero() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        t.to = address(0);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(GaslessTransfer.InvalidRecipient.selector);
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_RecipientIsThisContract() public {
        GaslessTransfer.Transfer memory t = _request(AMOUNT, FEE);
        t.to = address(transfer);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(GaslessTransfer.InvalidRecipient.selector);
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    function test_RevertWhen_SenderLacksUsdt() public {
        GaslessTransfer.Transfer memory t = _request(START_BALANCE + 1, FEE);
        (uint8 v, bytes32 r, bytes32 s) = _sign(senderPk, t);

        vm.expectRevert(bytes("ERC20: transfer amount exceeds balance"));
        vm.prank(relayer);
        transfer.sendWithAuthorization(t, v, r, s);
    }

    // ---------- The nonce the app must reproduce ----------

    function test_TransferNonce_MatchesTheAppsEncoding() public view {
        address to = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        bytes32 salt = bytes32(uint256(7));
        assertEq(
            transfer.transferNonce(to, FEE, salt), keccak256(abi.encode("SETTLE_TRANSFER", to, FEE, salt))
        );
        assertTrue(transfer.transferNonce(to, FEE, salt) != transfer.transferNonce(to, FEE + 1, salt));
        assertTrue(transfer.transferNonce(to, FEE, salt) != transfer.transferNonce(stranger, FEE, salt));
    }
}
