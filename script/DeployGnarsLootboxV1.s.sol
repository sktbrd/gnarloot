// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GnarsLootboxV1} from "../src/GnarsLootboxV1.sol";

// Deployment helper.
// Reads required values from env to avoid hard-coding network-specific addresses.
// Env vars (all required):
//   VRF_COORDINATOR        - address of Chainlink VRF v2.5 coordinator on Base
//   VRF_SUBSCRIPTION_ID    - uint256 subscription id
//   VRF_KEY_HASH           - bytes32 key hash for the lane to use
//   GNARS_TREASURY         - address payable treasury to receive proceeds
//   GNARS_INITIAL_OWNER    - address to own the contract (DAO multisig)
contract DeployGnarsLootboxV1 is Script {
  function run() external {
    address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
    uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
    bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
    address payable treasury = payable(vm.envAddress("GNARS_TREASURY"));
    address initialOwner = vm.envAddress("GNARS_INITIAL_OWNER");

    vm.startBroadcast();
    GnarsLootboxV1 lootbox = new GnarsLootboxV1(
      vrfCoordinator,
      subscriptionId,
      keyHash,
      treasury,
      initialOwner
    );
    vm.stopBroadcast();

    console2.log("GnarsLootboxV1 deployed at", address(lootbox));
    console2.log("VRF coordinator", vrfCoordinator);
    console2.log("subId", subscriptionId);
    console2.logBytes32(keyHash);
    console2.log("treasury", treasury);
    console2.log("owner", initialOwner);
  }
}
