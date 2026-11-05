// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Temporary: proves forge-std and OpenZeppelin resolve and that the pieces Settle needs
/// (ERC20Permit for MockUSDT, SafeERC20 + ReentrancyGuard for InvoiceRegistry) compile.
/// Deleted once InvoiceRegistry lands.
contract Smoke is ERC20Permit, ReentrancyGuard {
    using SafeERC20 for ERC20;

    constructor() ERC20("Smoke", "SMK") ERC20Permit("Smoke") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract SmokeTest is Test {
    Smoke internal token;

    function setUp() public {
        token = new Smoke();
    }

    function test_SixDecimals() public view {
        assertEq(token.decimals(), 6);
    }

    function test_PermitDomainSeparatorExists() public view {
        assertTrue(token.DOMAIN_SEPARATOR() != bytes32(0));
    }

    /// vm.sign is what we will use to forge EIP-3009 authorizations in the real tests.
    function test_VmSignWorks() public pure {
        (address signer, uint256 pk) = (vm.addr(0xA11CE), uint256(0xA11CE));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256("hello"));
        assertEq(ecrecover(keccak256("hello"), v, r, s), signer);
    }
}
