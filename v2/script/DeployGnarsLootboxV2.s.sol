// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {GnarsLootboxV2} from "../src/GnarsLootboxV2.sol";

contract DeployGnarsLootboxV2 is Script {
  function run() external returns (GnarsLootboxV2 deployed) {
    address coordinator = vm.envAddress("VRF_COORDINATOR");
    uint256 subId = vm.envUint("VRF_SUBSCRIPTION_ID");
    bytes32 keyHash = vm.envBytes32("VRF_KEY_HASH");
    address payable treasury = payable(vm.envAddress("GNARS_TREASURY"));
    address owner = vm.envAddress("GNARS_INITIAL_OWNER");
    address gnarsToken = vm.envAddress("GNARS_TOKEN");
    uint256 gnarsUnit = vm.envUint("GNARS_UNIT");

    vm.startBroadcast();
    deployed = new GnarsLootboxV2(coordinator, subId, keyHash, treasury, owner, gnarsToken, gnarsUnit);
    vm.stopBroadcast();
  }
}
