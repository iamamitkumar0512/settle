// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

interface IUSDTProbe {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
    function owner() external view returns (address);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function receiveWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore,
        bytes32 nonce, uint8 v, bytes32 r, bytes32 s
    ) external;
    function authorizationState(address, bytes32) external view returns (bool);
}

/// Throwaway probe: can we test the gasless path against the REAL test USDT in a fork,
/// instead of against a hand-written MockUSDT?
contract ForkProbe is Test {
    IUSDTProbe constant USDT = IUSDTProbe(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);
    uint256 constant PIN = 12304888;

    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    uint256 alicePk = 0xA11CE;
    address alice;
    address recipient = address(0xBEEF);

    function setUp() public {
        vm.createSelectFork("https://rpc.testnet.whitechain.io", PIN);
        alice = vm.addr(alicePk);
    }

    /// Route 1: forge's deal() cheatcode on a transparent proxy.
    function test_DealWorksOnRealUSDT() public {
        deal(address(USDT), alice, 500e6);
        assertEq(USDT.balanceOf(alice), 500e6, "deal failed to set balance");
    }

    /// Route 2: impersonate the owner and mint. Works locally even though we are not the owner.
    function test_PrankOwnerMintWorks() public {
        address owner = USDT.owner();
        vm.prank(owner);
        USDT.mint(alice, 250e6);
        assertEq(USDT.balanceOf(alice), 250e6, "prank+mint failed");
    }

    /// The real prize: sign an EIP-3009 authorization and have the REAL token accept it.
    function test_RealGaslessAuthorizationIsAccepted() public {
        deal(address(USDT), alice, 500e6);
        uint256 value = 120e6;
        uint256 validBefore = block.timestamp + 1800;
        bytes32 nonce = keccak256(abi.encode("SETTLE_INVOICE", uint256(1), alice));

        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, alice, recipient, value, 0, validBefore, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

        vm.prank(recipient);
        USDT.receiveWithAuthorization(alice, recipient, value, 0, validBefore, nonce, v, r, s);

        assertEq(USDT.balanceOf(recipient), value, "recipient was not paid");
        assertEq(USDT.balanceOf(alice), 500e6 - value, "payer not debited");
        assertTrue(USDT.authorizationState(alice, nonce), "nonce not marked used");
    }

    /// The security property the whole design rests on: only `to` can consume the signature.
    function test_OnlyRecipientCanConsumeAuthorization() public {
        deal(address(USDT), alice, 500e6);
        uint256 validBefore = block.timestamp + 1800;
        bytes32 nonce = keccak256(abi.encode("SETTLE_INVOICE", uint256(2), alice));
        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_TYPEHASH, alice, recipient, 120e6, 0, validBefore, nonce));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

        vm.prank(address(0xDEAD)); // an attacker, not `to`
        vm.expectRevert();
        USDT.receiveWithAuthorization(alice, recipient, 120e6, 0, validBefore, nonce, v, r, s);
    }
}
