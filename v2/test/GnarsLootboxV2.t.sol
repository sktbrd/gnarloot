// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GnarsLootboxV2} from "../src/GnarsLootboxV2.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";
import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {IVRFCoordinatorV2Plus} from "chainlink/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

contract GnarsLootboxV2Test is Test {
  GnarsLootboxV2 private lootbox;
  MockVRFCoordinator private coordinator;
  MockERC20 private gnars;
  MockERC721 private erc721;

  address payable private treasury = payable(address(0xBEEF));
  bytes32 private keyHash = bytes32("key");
  uint256 private subscriptionId = 1;
  uint256 private gnarsUnit = 1e18;

  function setUp() public {
    coordinator = new MockVRFCoordinator();
    gnars = new MockERC20();
    erc721 = new MockERC721();
    lootbox = new GnarsLootboxV2(
      address(coordinator),
      subscriptionId,
      keyHash,
      treasury,
      address(this),
      address(gnars),
      gnarsUnit
    );
  }

  function testOpenBoxTransfersBundleAssets() public {
    lootbox.setAllowedERC721(address(erc721), true);

    uint256 gnarsAmount = 1000 * gnarsUnit;
    gnars.mint(address(this), gnarsAmount);
    gnars.approve(address(lootbox), gnarsAmount);

    address[] memory nftContracts = new address[](2);
    uint256[] memory nftIds = new uint256[](2);
    nftContracts[0] = address(erc721);
    nftContracts[1] = address(erc721);
    nftIds[0] = 1;
    nftIds[1] = 2;

    erc721.mint(address(this), nftIds[0]);
    erc721.mint(address(this), nftIds[1]);
    erc721.approve(address(lootbox), nftIds[0]);
    erc721.approve(address(lootbox), nftIds[1]);

    lootbox.depositBundle(nftContracts, nftIds, gnarsAmount, GnarsLootboxV2.BoxType.Standard, 10);

    address user = address(0xA11CE);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price);

    vm.prank(user);
    uint256 requestId = lootbox.openBox{value: price}(GnarsLootboxV2.BoxType.Standard);

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    assertEq(gnars.balanceOf(user), gnarsAmount, "user should receive GNARS");
    assertEq(erc721.ownerOf(nftIds[0]), user, "user should receive NFT #1");
    assertEq(erc721.ownerOf(nftIds[1]), user, "user should receive NFT #2");
    assertEq(treasury.balance, price, "treasury should receive proceeds");
    (address pendingUser, , , , , ) = lootbox.pendingOpens(requestId);
    assertEq(pendingUser, address(0), "pending should be cleared");
  }

  function testFlexBoxTransfersGnarsAndNft() public {
    lootbox.setAllowedERC721(address(erc721), true);

    lootbox.setFlexConfig(0.0002 ether, 0, 10_000, 500 * gnarsUnit, 10_000 * gnarsUnit);

    uint256 gnarsDeposit = 50_000 * gnarsUnit;
    gnars.mint(address(this), gnarsDeposit);
    gnars.approve(address(lootbox), gnarsDeposit);
    lootbox.depositGnars(gnarsDeposit);

    uint256 tokenId = 77;
    erc721.mint(address(this), tokenId);
    erc721.approve(address(lootbox), tokenId);
    lootbox.depositFlexNft(address(erc721), tokenId);

    address user = address(0xB0B);
    uint256 paid = 0.0002 ether;
    vm.deal(user, paid);

    vm.prank(user);
    uint256 requestId = lootbox.openFlexBox{value: paid}();

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    uint256 expectedGnars = 500 * gnarsUnit + (paid * 10_000 * gnarsUnit / 1 ether);
    assertEq(gnars.balanceOf(user), expectedGnars, "user should receive GNARS");
    assertEq(erc721.ownerOf(tokenId), user, "user should receive flex NFT");
    (address pendingUser, , , , , ) = lootbox.pendingOpens(requestId);
    assertEq(pendingUser, address(0), "pending should be cleared");
  }

  function testFlexBoxNothingReleasesReserve() public {
    lootbox.setFlexConfig(0.0002 ether, 10_000, 0, 1000 * gnarsUnit, 0);

    uint256 gnarsDeposit = 2000 * gnarsUnit;
    gnars.mint(address(this), gnarsDeposit);
    gnars.approve(address(lootbox), gnarsDeposit);
    lootbox.depositGnars(gnarsDeposit);

    (, uint256 availableBefore, ) = lootbox.getFlexBalances();

    address user = address(0xB0B);
    uint256 paid = 0.0002 ether;
    vm.deal(user, paid);

    vm.prank(user);
    uint256 requestId = lootbox.openFlexBox{value: paid}();

    (, uint256 availableAfterOpen, ) = lootbox.getFlexBalances();
    assertEq(availableAfterOpen, availableBefore - 1000 * gnarsUnit, "reserve should reduce available");

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    (, uint256 availableAfterFulfill, ) = lootbox.getFlexBalances();
    assertEq(availableAfterFulfill, availableBefore, "reserve should be released on nothing");
    assertEq(gnars.balanceOf(user), 0, "user should receive no GNARS");
    (address pendingUser, , , , , ) = lootbox.pendingOpens(requestId);
    assertEq(pendingUser, address(0), "pending should be cleared");
  }

  function testFlexBoxRevertsWithoutNftPool() public {
    lootbox.setFlexConfig(0.0002 ether, 0, 100, 500 * gnarsUnit, 10_000 * gnarsUnit);

    uint256 gnarsDeposit = 1000 * gnarsUnit;
    gnars.mint(address(this), gnarsDeposit);
    gnars.approve(address(lootbox), gnarsDeposit);
    lootbox.depositGnars(gnarsDeposit);

    address user = address(0xCAFE);
    uint256 paid = 0.0002 ether;
    vm.deal(user, paid);

    vm.expectRevert(bytes("flex nft empty"));
    vm.prank(user);
    lootbox.openFlexBox{value: paid}();
  }

  function testGetPoolBalances() public {
    lootbox.setAllowedERC721(address(erc721), true);

    uint256 gnarsAmount = 1000 * gnarsUnit;
    gnars.mint(address(this), gnarsAmount);
    gnars.approve(address(lootbox), gnarsAmount);

    address[] memory nftContracts = new address[](1);
    uint256[] memory nftIds = new uint256[](1);
    nftContracts[0] = address(erc721);
    nftIds[0] = 5;
    erc721.mint(address(this), nftIds[0]);
    erc721.approve(address(lootbox), nftIds[0]);

    lootbox.depositBundle(nftContracts, nftIds, gnarsAmount, GnarsLootboxV2.BoxType.Gnarly, 2);

    (uint256 totalGnars, uint256 totalNfts, uint256 remainingBundles, uint256 totalWeight) =
      lootbox.getPoolBalances(GnarsLootboxV2.BoxType.Gnarly);

    assertEq(totalGnars, gnarsAmount);
    assertEq(totalNfts, 1);
    assertEq(remainingBundles, 1);
    assertEq(totalWeight, 2);
  }
}

contract MockVRFCoordinator is IVRFCoordinatorV2Plus, VRFConsumerBaseV2Plus {
  uint256 public nextRequestId = 1;
  mapping(uint256 => address) public consumers;

  constructor() VRFConsumerBaseV2Plus(address(this)) {}

  function fulfillRandomWords(uint256, uint256[] calldata) internal pure override {}

  function requestRandomWords(
    VRFV2PlusClient.RandomWordsRequest calldata /* req */
  ) external override returns (uint256 requestId) {
    requestId = nextRequestId++;
    consumers[requestId] = msg.sender;
  }

  function fulfill(uint256 requestId, uint256[] memory randomWords) external {
    address consumer = consumers[requestId];
    require(consumer != address(0), "unknown request");
    VRFConsumerBaseV2Plus(consumer).rawFulfillRandomWords(requestId, randomWords);
  }

  function addConsumer(uint256, address) external override {}
  function removeConsumer(uint256, address) external override {}
  function cancelSubscription(uint256, address) external override {}
  function acceptSubscriptionOwnerTransfer(uint256) external override {}
  function requestSubscriptionOwnerTransfer(uint256, address) external override {}
  function createSubscription() external pure override returns (uint256) { return 0; }
  function getSubscription(
    uint256
  )
    external
    pure
    override
    returns (uint96, uint96, uint64, address, address[] memory consumers_)
  {
    consumers_ = new address[](0);
    return (0, 0, 0, address(0), consumers_);
  }
  function pendingRequestExists(uint256) external pure override returns (bool) { return false; }
  function getActiveSubscriptionIds(uint256, uint256) external pure override returns (uint256[] memory ids) {
    ids = new uint256[](0);
  }
  function fundSubscriptionWithNative(uint256) external payable override {}
}

contract MockERC20 is ERC20("MockToken", "MOCK") {
  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

contract MockERC721 is ERC721("MockNFT", "MNFT") {
  function mint(address to, uint256 tokenId) external {
    _mint(to, tokenId);
  }
}
