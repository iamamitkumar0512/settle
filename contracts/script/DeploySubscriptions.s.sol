// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { Subscriptions } from "../src/Subscriptions.sol";
import { IUSDT } from "../src/IUSDT.sol";

/// Deploys Subscriptions against the real test USDT. Whitechain Sepolia only.
contract DeploySubscriptions is Script {
    uint256 constant WHITECHAIN_SEPOLIA = 1874;
    IUSDT constant USDT = IUSDT(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);

    function run() external returns (Subscriptions subscriptions) {
        require(block.chainid == WHITECHAIN_SEPOLIA, "Deploy: wrong chain");

        vm.startBroadcast();
        subscriptions = new Subscriptions(USDT);
        vm.stopBroadcast();

        console2.log("Subscriptions:", address(subscriptions));
    }
}
