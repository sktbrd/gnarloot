// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {GnarsLootboxV3} from "../src/GnarsLootboxV3.sol";

contract MockERC20 is ERC20("MockToken", "MOCK") {
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

contract GnarsLootboxV3Test is Test {
  GnarsLootboxV3 private lootbox;
  MockERC20 private gnars;

  address payable private treasury = payable(address(0xBEEF));
  bytes32 private keyHash = bytes32(uint256(1));
  uint256 private subscriptionId = 1;

  function setUp() public {
    gnars = new MockERC20();
    lootbox = new GnarsLootboxV3(
      address(0x1234),
      subscriptionId,
      keyHash,
      treasury,
      address(this),
      address(gnars),
      1 ether
    );
  }

  function testFlexNftBpsScaling() public {
    lootbox.setFlexConfig(
      0.0002 ether,
      100,
      50,
      2000,
      1000,
      500 ether,
      10_000 ether
    );

    (, uint16 nftBpsMin, ) = lootbox.getFlexPreview(0.0002 ether);
    assertEq(nftBpsMin, 50);

    (, uint16 nftBpsMid, ) = lootbox.getFlexPreview(1.0002 ether);
    assertEq(nftBpsMid, 1050);

    (, uint16 nftBpsMax, ) = lootbox.getFlexPreview(10 ether);
    assertEq(nftBpsMax, 2000);
  }

  function testFlexConfigRevertsOnBadBps() public {
    vm.expectRevert(bytes("bad bps"));
    lootbox.setFlexConfig(
      0.0002 ether,
      9600,
      500,
      600,
      0,
      500 ether,
      10_000 ether
    );
  }
}
