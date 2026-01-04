// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";

contract GnarsLootboxV2 is VRFConsumerBaseV2Plus, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  enum BoxType { Standard, Gnarly, Epic, Flex }

  struct Bundle {
    uint32 weight;
    uint256 gnarsAmount;
    address[] nftContracts;
    uint256[] nftIds;
    bool consumed;
  }

  struct Pool {
    Bundle[] bundles;
    uint256 totalWeight;
    uint256 remaining;
    uint256 totalGnars;
    uint256 totalNfts;
  }

  struct FlexNft {
    address nft;
    uint256 tokenId;
    bool consumed;
  }

  struct PendingOpen {
    address user;
    BoxType boxType;
    uint256 paid;
    uint256 flexGnarsPayout;
    bool fulfilled;
    bool flexNftReserved;
  }

  Pool private standardPool;
  Pool private gnarlyPool;
  Pool private epicPool;

  FlexNft[] private flexNfts;
  uint256 public flexNftRemaining;
  uint256 public flexNftReserved;

  mapping(uint256 => PendingOpen) public pendingOpens;
  mapping(address => bool) public allowedERC721;

  IERC20 public immutable gnarsToken;
  uint256 public immutable gnarsUnit;

  uint256 public standardPrice = 0.02 ether;
  uint256 public gnarlyPrice = 0.05 ether;
  uint256 public epicPrice = 0.1 ether;

  address payable public treasury;

  uint256 public subscriptionId;
  bytes32 public keyHash;
  uint32 public callbackGasLimit = 400_000;
  uint16 public requestConfirmations = 3;
  uint32 public numWords = 1;

  uint256 public minFlexEth = 0.0002 ether;
  uint16 public flexNothingBps = 20;
  uint16 public flexNftBps = 50;
  uint256 public flexGnarsBase;
  uint256 public flexGnarsPerEth;

  uint256 public totalReservedGnars;
  uint256 public flexGnarsReserved;

  event AllowedERC721Updated(address indexed nft, bool allowed);
  event TreasuryUpdated(address indexed treasury);
  event FlexConfigUpdated(
    uint256 minFlexEth,
    uint16 flexNothingBps,
    uint16 flexNftBps,
    uint256 flexGnarsBase,
    uint256 flexGnarsPerEth
  );

  event BundleDeposited(
    BoxType indexed boxType,
    uint256 gnarsAmount,
    uint32 weight,
    uint256 bundleIndex
  );

  event FlexNftDeposited(address indexed nft, uint256 indexed tokenId, uint256 flexIndex);
  event GnarsDeposited(uint256 amount);

  event OpenRequested(uint256 indexed requestId, address indexed user, BoxType indexed boxType, uint256 paid);

  event BundleOpened(
    uint256 indexed requestId,
    address indexed user,
    BoxType indexed boxType,
    uint256 gnarsAmount,
    uint256 bundleIndex
  );

  event FlexOpened(
    uint256 indexed requestId,
    address indexed user,
    uint256 paid,
    uint256 gnarsAmount,
    address nft,
    uint256 tokenId,
    bool nothing
  );
  event OpenRetried(uint256 indexed oldRequestId, uint256 indexed newRequestId);
  event OpenCancelled(uint256 indexed requestId, address indexed user, BoxType indexed boxType, uint256 paid);

  constructor(
    address vrfCoordinator,
    uint256 _subscriptionId,
    bytes32 _keyHash,
    address payable _treasury,
    address initialOwner,
    address _gnarsToken,
    uint256 _gnarsUnit
  ) VRFConsumerBaseV2Plus(vrfCoordinator) {
    require(initialOwner != address(0), "owner=0");
    require(_gnarsToken != address(0), "gnars=0");
    require(_gnarsUnit > 0, "unit=0");

    if (initialOwner != msg.sender) {
      transferOwnership(initialOwner);
    }

    subscriptionId = _subscriptionId;
    keyHash = _keyHash;
    treasury = _treasury;
    gnarsToken = IERC20(_gnarsToken);
    gnarsUnit = _gnarsUnit;

    flexGnarsBase = 500 * _gnarsUnit;
    flexGnarsPerEth = 10_000 * _gnarsUnit;
  }

  // ------- Admin: allowlist + config -------
  function setAllowedERC721(address nft, bool allowed) external onlyOwner {
    allowedERC721[nft] = allowed;
    emit AllowedERC721Updated(nft, allowed);
  }

  function setTreasury(address payable _treasury) external onlyOwner {
    treasury = _treasury;
    emit TreasuryUpdated(_treasury);
  }

  function setPrices(uint256 standard, uint256 gnarly, uint256 epic) external onlyOwner {
    standardPrice = standard;
    gnarlyPrice = gnarly;
    epicPrice = epic;
  }

  function setVrfConfig(
    uint32 _callbackGasLimit,
    uint16 _requestConfirmations,
    uint32 _numWords,
    bytes32 _keyHash
  ) external onlyOwner {
    callbackGasLimit = _callbackGasLimit;
    requestConfirmations = _requestConfirmations;
    numWords = _numWords;
    keyHash = _keyHash;
  }

  function setFlexConfig(
    uint256 _minFlexEth,
    uint16 _flexNothingBps,
    uint16 _flexNftBps,
    uint256 _flexGnarsBase,
    uint256 _flexGnarsPerEth
  ) external onlyOwner {
    require(_flexNothingBps + _flexNftBps <= 10_000, "bad bps");
    minFlexEth = _minFlexEth;
    flexNothingBps = _flexNothingBps;
    flexNftBps = _flexNftBps;
    flexGnarsBase = _flexGnarsBase;
    flexGnarsPerEth = _flexGnarsPerEth;
    emit FlexConfigUpdated(_minFlexEth, _flexNothingBps, _flexNftBps, _flexGnarsBase, _flexGnarsPerEth);
  }

  function pause() external onlyOwner { _pause(); }
  function unpause() external onlyOwner { _unpause(); }

  // ------- Admin: deposits -------
  function depositBundle(
    address[] calldata nftContracts,
    uint256[] calldata nftIds,
    uint256 gnarsAmount,
    BoxType boxType,
    uint32 weight
  ) external onlyOwner {
    require(boxType != BoxType.Flex, "flex uses own pool");
    require(weight > 0, "weight=0");
    require(nftContracts.length == nftIds.length, "length mismatch");
    require(nftContracts.length > 0 && nftContracts.length <= 3, "nft count");
    require(_isAllowedGnarsAmount(gnarsAmount), "bad gnars amount");

    gnarsToken.safeTransferFrom(msg.sender, address(this), gnarsAmount);

    for (uint256 i = 0; i < nftContracts.length; i++) {
      address nft = nftContracts[i];
      require(allowedERC721[nft], "erc721 not allowed");
      IERC721(nft).transferFrom(msg.sender, address(this), nftIds[i]);
    }

    Pool storage p = _pool(boxType);
    p.bundles.push(Bundle({
      weight: weight,
      gnarsAmount: gnarsAmount,
      nftContracts: nftContracts,
      nftIds: nftIds,
      consumed: false
    }));
    p.totalWeight += weight;
    p.remaining += 1;
    p.totalGnars += gnarsAmount;
    p.totalNfts += nftContracts.length;
    totalReservedGnars += gnarsAmount;

    emit BundleDeposited(boxType, gnarsAmount, weight, p.bundles.length - 1);
  }

  function depositFlexNft(address nft, uint256 tokenId) external onlyOwner {
    require(allowedERC721[nft], "erc721 not allowed");
    IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

    flexNfts.push(FlexNft({nft: nft, tokenId: tokenId, consumed: false}));
    flexNftRemaining += 1;

    emit FlexNftDeposited(nft, tokenId, flexNfts.length - 1);
  }

  function depositGnars(uint256 amount) external onlyOwner {
    require(amount > 0, "amount=0");
    gnarsToken.safeTransferFrom(msg.sender, address(this), amount);
    emit GnarsDeposited(amount);
  }

  // ------- User: open box -------
  function openBox(BoxType boxType) external payable nonReentrant whenNotPaused returns (uint256 requestId) {
    require(boxType != BoxType.Flex, "use flex");
    uint256 price = _price(boxType);
    require(msg.value == price, "wrong price");

    Pool storage p = _pool(boxType);
    require(p.remaining > 0, "empty pool");
    require(p.totalWeight > 0, "no weight");

    _forwardTreasury(msg.value);
    requestId = _requestRandomness();

    pendingOpens[requestId] = PendingOpen({
      user: msg.sender,
      boxType: boxType,
      paid: msg.value,
      flexGnarsPayout: 0,
      fulfilled: false,
      flexNftReserved: false
    });

    emit OpenRequested(requestId, msg.sender, boxType, msg.value);
  }

  function openFlexBox() external payable nonReentrant whenNotPaused returns (uint256 requestId) {
    require(msg.value >= minFlexEth, "min flex");
    require(flexNftBps == 0 || flexNftRemaining > flexNftReserved, "flex nft empty");

    uint256 gnarsPayout = _calcFlexGnars(msg.value);
    require(_availableGnars() >= gnarsPayout, "insufficient gnars");

    if (flexNftBps > 0) {
      flexNftReserved += 1;
    }
    flexGnarsReserved += gnarsPayout;

    _forwardTreasury(msg.value);
    requestId = _requestRandomness();

    pendingOpens[requestId] = PendingOpen({
      user: msg.sender,
      boxType: BoxType.Flex,
      paid: msg.value,
      flexGnarsPayout: gnarsPayout,
      fulfilled: false,
      flexNftReserved: flexNftBps > 0
    });

    emit OpenRequested(requestId, msg.sender, BoxType.Flex, msg.value);
  }

  // ------- Admin: recovery -------
  function retryOpen(uint256 requestId) external onlyOwner returns (uint256 newRequestId) {
    PendingOpen storage po = pendingOpens[requestId];
    require(po.user != address(0), "unknown request");
    require(!po.fulfilled, "already fulfilled");

    newRequestId = _requestRandomness();
    pendingOpens[newRequestId] = po;
    delete pendingOpens[requestId];

    emit OpenRetried(requestId, newRequestId);
  }

  function cancelOpen(uint256 requestId) external onlyOwner {
    PendingOpen storage po = pendingOpens[requestId];
    require(po.user != address(0), "unknown request");
    require(!po.fulfilled, "already fulfilled");

    if (po.flexNftReserved && flexNftReserved > 0) {
      flexNftReserved -= 1;
    }
    if (po.flexGnarsPayout > 0 && flexGnarsReserved >= po.flexGnarsPayout) {
      flexGnarsReserved -= po.flexGnarsPayout;
    }

    emit OpenCancelled(requestId, po.user, po.boxType, po.paid);
    delete pendingOpens[requestId];
  }

  // ------- VRF callback -------
  function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
    PendingOpen storage po = pendingOpens[requestId];
    require(po.user != address(0), "unknown request");
    require(!po.fulfilled, "already fulfilled");
    po.fulfilled = true;

    if (po.boxType == BoxType.Flex) {
      _fulfillFlex(requestId, po, randomWords[0]);
      delete pendingOpens[requestId];
      return;
    }

    Pool storage p = _pool(po.boxType);
    uint256 bundleIndex = _selectBundleIndex(p, randomWords[0]);
    Bundle storage b = p.bundles[bundleIndex];
    require(!b.consumed, "consumed");

    b.consumed = true;
    p.remaining -= 1;
    p.totalWeight -= b.weight;
    p.totalGnars -= b.gnarsAmount;
    p.totalNfts -= b.nftContracts.length;
    totalReservedGnars -= b.gnarsAmount;

    gnarsToken.safeTransfer(po.user, b.gnarsAmount);
    for (uint256 i = 0; i < b.nftContracts.length; i++) {
      IERC721(b.nftContracts[i]).safeTransferFrom(address(this), po.user, b.nftIds[i]);
    }

    emit BundleOpened(requestId, po.user, po.boxType, b.gnarsAmount, bundleIndex);
    delete pendingOpens[requestId];
  }

  // ------- Views -------
  function getPoolBalances(
    BoxType boxType
  ) external view returns (uint256 totalGnars, uint256 totalNfts, uint256 remainingBundles, uint256 totalWeight) {
    require(boxType != BoxType.Flex, "use flex");
    Pool storage p = _pool(boxType);
    return (p.totalGnars, p.totalNfts, p.remaining, p.totalWeight);
  }

  function getFlexBalances()
    external
    view
    returns (uint256 flexNftsAvailable, uint256 availableGnars, uint256 reservedGnars)
  {
    return (flexNftRemaining - flexNftReserved, _availableGnars(), totalReservedGnars);
  }

  // ------- internals -------
  function _requestRandomness() internal returns (uint256 requestId) {
    VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
      keyHash: keyHash,
      subId: subscriptionId,
      requestConfirmations: requestConfirmations,
      callbackGasLimit: callbackGasLimit,
      numWords: numWords,
      extraArgs: VRFV2PlusClient._argsToBytes(
        VRFV2PlusClient.ExtraArgsV1({nativePayment: true})
      )
    });

    requestId = s_vrfCoordinator.requestRandomWords(req);
  }

  function _forwardTreasury(uint256 amount) internal {
    (bool ok, ) = treasury.call{value: amount}("");
    require(ok, "treasury xfer failed");
  }

  function _pool(BoxType boxType) internal view returns (Pool storage) {
    if (boxType == BoxType.Standard) return standardPool;
    if (boxType == BoxType.Gnarly) return gnarlyPool;
    return epicPool;
  }

  function _price(BoxType boxType) internal view returns (uint256) {
    if (boxType == BoxType.Standard) return standardPrice;
    if (boxType == BoxType.Gnarly) return gnarlyPrice;
    return epicPrice;
  }

  function _selectBundleIndex(Pool storage p, uint256 rand) internal view returns (uint256) {
    uint256 target = rand % p.totalWeight;
    uint256 cumulative = 0;

    uint256 len = p.bundles.length;
    for (uint256 i = 0; i < len; i++) {
      Bundle storage b = p.bundles[i];
      if (b.consumed) continue;
      cumulative += b.weight;
      if (target < cumulative) return i;
    }
    revert("selection failed");
  }

  function _selectFlexNft(uint256 rand) internal returns (FlexNft memory picked, uint256 index) {
    require(flexNftRemaining > 0, "flex nft empty");
    uint256 target = rand % flexNftRemaining;
    uint256 seen = 0;

    uint256 len = flexNfts.length;
    for (uint256 i = 0; i < len; i++) {
      FlexNft storage n = flexNfts[i];
      if (n.consumed) continue;
      if (seen == target) {
        n.consumed = true;
        flexNftRemaining -= 1;
        return (n, i);
      }
      seen += 1;
    }
    revert("selection failed");
  }

  function _calcFlexGnars(uint256 paid) internal view returns (uint256) {
    return flexGnarsBase + (paid * flexGnarsPerEth / 1 ether);
  }

  function _availableGnars() internal view returns (uint256) {
    uint256 balance = gnarsToken.balanceOf(address(this));
    if (balance <= totalReservedGnars + flexGnarsReserved) return 0;
    return balance - totalReservedGnars - flexGnarsReserved;
  }

  function _isAllowedGnarsAmount(uint256 amount) internal view returns (bool) {
    return amount == 1000 * gnarsUnit
      || amount == 5000 * gnarsUnit
      || amount == 10_000 * gnarsUnit
      || amount == 100_000 * gnarsUnit;
  }

  function _fulfillFlex(uint256 requestId, PendingOpen storage po, uint256 rand) internal {
    uint256 roll = rand % 10_000;
    uint256 rollNft = (rand / 10_000) % 10_000;
    uint256 pick = rand / 10_000 / 10_000;

    bool nothing = roll < flexNothingBps;
    bool grantNft = (!nothing && rollNft < flexNftBps);
    uint256 gnarsPayout = 0;
    address nft = address(0);
    uint256 tokenId = 0;

    flexGnarsReserved -= po.flexGnarsPayout;
    if (po.flexNftReserved) {
      flexNftReserved -= 1;
    }

    if (!nothing) {
      gnarsPayout = po.flexGnarsPayout;
      gnarsToken.safeTransfer(po.user, gnarsPayout);
    }

    if (grantNft) {
      (FlexNft memory picked, ) = _selectFlexNft(pick);
      nft = picked.nft;
      tokenId = picked.tokenId;
      IERC721(nft).safeTransferFrom(address(this), po.user, tokenId);
    }

    emit FlexOpened(requestId, po.user, po.paid, gnarsPayout, nft, tokenId, nothing);
  }

receive() external payable {}
}
