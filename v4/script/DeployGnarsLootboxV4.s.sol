// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GnarsLootboxV4} from "../src/GnarsLootboxV4.sol";

// Env vars (all required):
//   VRF_COORDINATOR        - address of Chainlink VRF v2.5 coordinator on Base
//   VRF_SUBSCRIPTION_ID    - uint256 subscription id
//   VRF_KEY_HASH           - bytes32 key hash for the lane to use
//   GNARS_TREASURY         - address payable treasury to receive proceeds
//   GNARS_INITIAL_OWNER    - address to own the contract (DAO multisig)
//   GNARS_TOKEN            - GNARS ERC20 token address
//   GNARS_UNIT             - base unit for GNARS (e.g. 1e18)
contract DeployGnarsLootboxV4 is Script {
  function run() external {
    address vrfCoordinator = vm.envAddress("VRF_COORDINATOR");
    uint256 subscriptionId = vm.envUint("VRF_SUBSCRIPTION_ID");
    bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
    address payable treasury = payable(vm.envAddress("GNARS_TREASURY"));
    address initialOwner = vm.envAddress("GNARS_INITIAL_OWNER");
    address gnarsToken = vm.envAddress("GNARS_TOKEN");
    uint256 gnarsUnit = vm.envUint("GNARS_UNIT");

    vm.startBroadcast();
    GnarsLootboxV4 lootbox = new GnarsLootboxV4(
      vrfCoordinator,
      subscriptionId,
      keyHash,
      treasury,
      initialOwner,
      gnarsToken,
      gnarsUnit
    );
    vm.stopBroadcast();

    console2.log("GnarsLootboxV4 deployed at", address(lootbox));
    console2.log("VRF coordinator", vrfCoordinator);
    console2.log("subId", subscriptionId);
    console2.logBytes32(keyHash);
    console2.log("treasury", treasury);
    console2.log("owner", initialOwner);
    console2.log("gnarsToken", gnarsToken);
    console2.log("gnarsUnit", gnarsUnit);
  }
}
