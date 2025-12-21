// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GnarsLootboxV1} from "../src/GnarsLootboxV1.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";
import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {IVRFCoordinatorV2Plus} from "chainlink/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract GnarsLootboxV1Test is Test {
  GnarsLootboxV1 private lootbox;
  MockVRFCoordinator private coordinator;
  MockERC20 private erc20;
  MockERC721 private erc721;

  address payable private treasury = payable(address(0xBEEF));
  bytes32 private keyHash = bytes32("key");
  uint256 private subscriptionId = 1;

  function setUp() public {
    coordinator = new MockVRFCoordinator();
    lootbox = new GnarsLootboxV1(address(coordinator), subscriptionId, keyHash, treasury, address(this));
    erc20 = new MockERC20();
    erc721 = new MockERC721();
  }

  function testOpenBoxTransfersERC20Reward() public {
    uint256 rewardAmount = 1 ether;
    erc20.mint(address(this), rewardAmount);
    erc20.approve(address(lootbox), rewardAmount);

    lootbox.depositERC20(address(erc20), rewardAmount, GnarsLootboxV1.BoxType.Standard, 10);

    address user = address(0xA11CE);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price);

    vm.prank(user);
    uint256 requestId = lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Standard);

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    assertEq(erc20.balanceOf(user), rewardAmount, "user should receive ERC20 reward");
    assertEq(erc20.balanceOf(address(lootbox)), 0, "lootbox should not retain ERC20");

    (address pendingUser, GnarsLootboxV1.BoxType boxType, bool fulfilled) = lootbox.pendingOpens(requestId);
    assertEq(pendingUser, user);
    assertEq(uint256(boxType), uint256(GnarsLootboxV1.BoxType.Standard));
    assertTrue(fulfilled);
    assertEq(treasury.balance, price, "treasury should receive proceeds");
  }

  function testOpenBoxTransfersERC721Reward() public {
    lootbox.setAllowedERC721(address(erc721), true);

    uint256 tokenId = 42;
    erc721.mint(address(this), tokenId);
    erc721.approve(address(lootbox), tokenId);

    lootbox.depositERC721(address(erc721), tokenId, GnarsLootboxV1.BoxType.Gnarly, 5);

    address user = address(0xB0B);
    uint256 price = lootbox.gnarlyPrice();
    vm.deal(user, price);

    vm.prank(user);
    uint256 requestId = lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Gnarly);

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    assertEq(erc721.ownerOf(tokenId), user, "user should receive NFT");
    assertEq(treasury.balance, price, "treasury should receive proceeds");
  }

  function testOpenBoxRevertsWrongPrice() public {
    uint256 rewardAmount = 1 ether;
    erc20.mint(address(this), rewardAmount);
    erc20.approve(address(lootbox), rewardAmount);
    lootbox.depositERC20(address(erc20), rewardAmount, GnarsLootboxV1.BoxType.Standard, 1);

    address user = address(0x1234);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price);

    vm.expectRevert(bytes("wrong price"));
    vm.prank(user);
    lootbox.openBox{value: price - 1}(GnarsLootboxV1.BoxType.Standard);
  }

  function testOpenBoxRevertsWhenPaused() public {
    uint256 rewardAmount = 1 ether;
    erc20.mint(address(this), rewardAmount);
    erc20.approve(address(lootbox), rewardAmount);
    lootbox.depositERC20(address(erc20), rewardAmount, GnarsLootboxV1.BoxType.Standard, 1);

    lootbox.pause();

    address user = address(0x5678);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price);

    vm.expectRevert(Pausable.EnforcedPause.selector);
    vm.prank(user);
    lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Standard);
  }

  function testOpenBoxRevertsEmptyPool() public {
    address user = address(0x9999);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price);

    vm.expectRevert(bytes("empty pool"));
    vm.prank(user);
    lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Standard);
  }

  function testCannotOpenAfterRewardConsumed() public {
    uint256 rewardAmount = 1 ether;
    erc20.mint(address(this), rewardAmount);
    erc20.approve(address(lootbox), rewardAmount);
    lootbox.depositERC20(address(erc20), rewardAmount, GnarsLootboxV1.BoxType.Standard, 1);

    address user = address(0xAAAA);
    uint256 price = lootbox.standardPrice();
    vm.deal(user, price * 2);

    vm.prank(user);
    uint256 requestId = lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Standard);

    uint256[] memory words = new uint256[](1);
    words[0] = 0;
    coordinator.fulfill(requestId, words);

    vm.expectRevert(bytes("empty pool"));
    vm.prank(user);
    lootbox.openBox{value: price}(GnarsLootboxV1.BoxType.Standard);
  }

  function testDepositERC721RequiresAllowlist() public {
    uint256 tokenId = 7;
    erc721.mint(address(this), tokenId);
    erc721.approve(address(lootbox), tokenId);

    vm.expectRevert(bytes("erc721 not allowed"));
    lootbox.depositERC721(address(erc721), tokenId, GnarsLootboxV1.BoxType.Standard, 1);
  }

  function testDepositRevertsWeightZero() public {
    erc20.mint(address(this), 1 ether);
    erc20.approve(address(lootbox), 1 ether);
    vm.expectRevert(bytes("weight=0"));
    lootbox.depositERC20(address(erc20), 1 ether, GnarsLootboxV1.BoxType.Standard, 0);
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

  // Unused IVRFSubscriptionV2Plus methods for testing only.
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
