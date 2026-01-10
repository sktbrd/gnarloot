// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";

contract GnarsLootboxV4 is VRFConsumerBaseV2Plus, Pausable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct FlexNft {
    address nft;
    uint256 tokenId;
    bool consumed;
  }

  struct PendingOpen {
    address user;
    uint256 paid;
    uint256 flexGnarsPayout;
    uint16 flexNothingBps;
    uint16 flexNftBps;
    bool fulfilled;
    bool flexNftReserved;
  }

  FlexNft[] private flexNfts;
  mapping(address => mapping(uint256 => uint256)) private flexNftIndex;
  uint256 public flexNftRemaining;
  uint256 public flexNftReserved;

  mapping(uint256 => PendingOpen) public pendingOpens;
  mapping(address => bool) public allowedERC721;

  IERC20 public immutable gnarsToken;
  uint256 public immutable gnarsUnit;

  address payable public treasury;

  uint256 public subscriptionId;
  bytes32 public keyHash;
  uint32 public callbackGasLimit = 400_000;
  uint16 public requestConfirmations = 3;
  uint32 public numWords = 1;

  uint256 public minFlexEth = 0.0002 ether;
  uint16 public flexNothingBps = 20;
  uint16 public flexNftBpsMin = 50;
  uint16 public flexNftBpsMax = 50;
  uint32 public flexNftBpsPerEth = 0;
  uint256 public flexGnarsBase;
  uint256 public flexGnarsPerEth;

  uint256 public flexGnarsReserved;

  event AllowedERC721Updated(address indexed nft, bool allowed);
  event TreasuryUpdated(address indexed treasury);
  event SubscriptionIdUpdated(uint256 subscriptionId);
  event FlexConfigUpdated(
    uint256 minFlexEth,
    uint16 flexNothingBps,
    uint16 flexNftBpsMin,
    uint16 flexNftBpsMax,
    uint32 flexNftBpsPerEth,
    uint256 flexGnarsBase,
    uint256 flexGnarsPerEth
  );
  event FlexNftDeposited(address indexed nft, uint256 indexed tokenId, uint256 flexIndex);
  event FlexNftWithdrawn(address indexed nft, uint256 indexed tokenId, uint256 flexIndex, address indexed to);
  event GnarsDeposited(uint256 amount);
  event GnarsWithdrawn(address indexed to, uint256 amount);
  event ERC20Withdrawn(address indexed token, address indexed to, uint256 amount);
  event ERC721Withdrawn(address indexed nft, address indexed to, uint256 tokenId);
  event EthWithdrawn(address indexed to, uint256 amount);

  event OpenRequested(uint256 indexed requestId, address indexed user, uint256 paid);
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
  event OpenCancelled(uint256 indexed requestId, address indexed user, uint256 paid);

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

  function setSubscriptionId(uint256 _subscriptionId) external onlyOwner {
    subscriptionId = _subscriptionId;
    emit SubscriptionIdUpdated(_subscriptionId);
  }

  function setFlexConfig(
    uint256 _minFlexEth,
    uint16 _flexNothingBps,
    uint16 _flexNftBpsMin,
    uint16 _flexNftBpsMax,
    uint32 _flexNftBpsPerEth,
    uint256 _flexGnarsBase,
    uint256 _flexGnarsPerEth
  ) external onlyOwner {
    require(_flexNftBpsMin <= _flexNftBpsMax, "bad nft range");
    require(_flexNothingBps + _flexNftBpsMax <= 10_000, "bad bps");
    minFlexEth = _minFlexEth;
    flexNothingBps = _flexNothingBps;
    flexNftBpsMin = _flexNftBpsMin;
    flexNftBpsMax = _flexNftBpsMax;
    flexNftBpsPerEth = _flexNftBpsPerEth;
    flexGnarsBase = _flexGnarsBase;
    flexGnarsPerEth = _flexGnarsPerEth;
    emit FlexConfigUpdated(
      _minFlexEth,
      _flexNothingBps,
      _flexNftBpsMin,
      _flexNftBpsMax,
      _flexNftBpsPerEth,
      _flexGnarsBase,
      _flexGnarsPerEth
    );
  }

  function pause() external onlyOwner { _pause(); }
  function unpause() external onlyOwner { _unpause(); }

  // ------- Admin: deposits -------
  function depositFlexNft(address nft, uint256 tokenId) external onlyOwner {
    require(allowedERC721[nft], "erc721 not allowed");
    require(flexNftIndex[nft][tokenId] == 0, "nft deposited");
    IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

    flexNfts.push(FlexNft({nft: nft, tokenId: tokenId, consumed: false}));
    flexNftRemaining += 1;
    flexNftIndex[nft][tokenId] = flexNfts.length;

    emit FlexNftDeposited(nft, tokenId, flexNfts.length - 1);
  }

  function depositFlexNftBatch(address nft, uint256[] calldata tokenIds) external onlyOwner {
    require(allowedERC721[nft], "erc721 not allowed");
    require(tokenIds.length > 0, "tokenIds=0");
    for (uint256 i = 0; i < tokenIds.length; i++) {
      uint256 tokenId = tokenIds[i];
      require(flexNftIndex[nft][tokenId] == 0, "nft deposited");
      IERC721(nft).transferFrom(msg.sender, address(this), tokenId);
      flexNfts.push(FlexNft({nft: nft, tokenId: tokenId, consumed: false}));
      flexNftRemaining += 1;
      flexNftIndex[nft][tokenId] = flexNfts.length;
      emit FlexNftDeposited(nft, tokenId, flexNfts.length - 1);
    }
  }

  function depositGnars(uint256 amount) external onlyOwner {
    require(amount > 0, "amount=0");
    gnarsToken.safeTransferFrom(msg.sender, address(this), amount);
    emit GnarsDeposited(amount);
  }

  // ------- Admin: withdrawals -------
  function withdrawGnars(address to, uint256 amount) external onlyOwner {
    require(to != address(0), "to=0");
    require(amount > 0, "amount=0");
    require(_availableGnars() >= amount, "insufficient gnars");
    gnarsToken.safeTransfer(to, amount);
    emit GnarsWithdrawn(to, amount);
  }

  function withdrawERC20(address token, address to, uint256 amount) external onlyOwner {
    require(token != address(gnarsToken), "use withdraw gnars");
    require(to != address(0), "to=0");
    require(amount > 0, "amount=0");
    IERC20(token).safeTransfer(to, amount);
    emit ERC20Withdrawn(token, to, amount);
  }

  function withdrawFlexNft(address nft, uint256 tokenId, address to) external onlyOwner {
    require(to != address(0), "to=0");
    uint256 indexPlus = flexNftIndex[nft][tokenId];
    require(indexPlus != 0, "not in flex");
    require(flexNftRemaining > flexNftReserved, "flex nft reserved");
    uint256 index = indexPlus - 1;
    FlexNft storage f = flexNfts[index];
    require(!f.consumed, "consumed");

    f.consumed = true;
    flexNftRemaining -= 1;
    flexNftIndex[nft][tokenId] = 0;

    IERC721(nft).safeTransferFrom(address(this), to, tokenId);
    emit FlexNftWithdrawn(nft, tokenId, index, to);
  }

  function withdrawERC721(address nft, uint256 tokenId, address to) external onlyOwner {
    require(to != address(0), "to=0");
    require(flexNftIndex[nft][tokenId] == 0, "use flex withdraw");
    IERC721(nft).safeTransferFrom(address(this), to, tokenId);
    emit ERC721Withdrawn(nft, to, tokenId);
  }

  function withdrawETH(address payable to, uint256 amount) external onlyOwner {
    require(to != address(0), "to=0");
    require(amount > 0, "amount=0");
    require(address(this).balance >= amount, "balance");
    (bool ok, ) = to.call{value: amount}("");
    require(ok, "eth xfer failed");
    emit EthWithdrawn(to, amount);
  }

  // ------- User: open flex box -------
  function openFlexBox() external payable nonReentrant whenNotPaused returns (uint256 requestId) {
    require(msg.value >= minFlexEth, "min flex");

    uint16 nftBps = _flexNftBpsForPaid(msg.value);
    if (nftBps > 0) {
      require(flexNftRemaining > flexNftReserved, "flex nft empty");
    }

    uint256 gnarsPayout = _calcFlexGnars(msg.value);
    require(_availableGnars() >= gnarsPayout, "insufficient gnars");

    if (nftBps > 0) {
      flexNftReserved += 1;
    }
    flexGnarsReserved += gnarsPayout;

    _forwardTreasury(msg.value);
    requestId = _requestRandomness();

    pendingOpens[requestId] = PendingOpen({
      user: msg.sender,
      paid: msg.value,
      flexGnarsPayout: gnarsPayout,
      flexNothingBps: flexNothingBps,
      flexNftBps: nftBps,
      fulfilled: false,
      flexNftReserved: nftBps > 0
    });

    emit OpenRequested(requestId, msg.sender, msg.value);
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

    emit OpenCancelled(requestId, po.user, po.paid);
    delete pendingOpens[requestId];
  }

  // ------- VRF callback -------
  function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
    PendingOpen storage po = pendingOpens[requestId];
    require(po.user != address(0), "unknown request");
    require(!po.fulfilled, "already fulfilled");
    po.fulfilled = true;

    _fulfillFlex(requestId, po, randomWords[0]);
    delete pendingOpens[requestId];
  }

  // ------- Views -------
  function getFlexBalances()
    external
    view
    returns (uint256 flexNftsAvailable, uint256 availableGnars, uint256 reservedGnars)
  {
    return (flexNftRemaining - flexNftReserved, _availableGnars(), flexGnarsReserved);
  }

  function getFlexPreview(uint256 paid)
    external
    view
    returns (uint16 nothingBps, uint16 nftBps, uint256 gnarsPayout)
  {
    return (flexNothingBps, _flexNftBpsForPaid(paid), _calcFlexGnars(paid));
  }

  function flexNftsLength() external view returns (uint256) {
    return flexNfts.length;
  }

  function getFlexNft(uint256 index) external view returns (address nft, uint256 tokenId, bool consumed) {
    FlexNft storage f = flexNfts[index];
    return (f.nft, f.tokenId, f.consumed);
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
        flexNftIndex[n.nft][n.tokenId] = 0;
        return (n, i);
      }
      seen += 1;
    }
    revert("selection failed");
  }

  function _calcFlexGnars(uint256 paid) internal view returns (uint256) {
    return flexGnarsBase + (paid * flexGnarsPerEth / 1 ether);
  }

  function _flexNftBpsForPaid(uint256 paid) internal view returns (uint16) {
    if (flexNftBpsMax == 0) return 0;
    if (paid <= minFlexEth || flexNftBpsPerEth == 0) return flexNftBpsMin;
    uint256 extra = (paid - minFlexEth) * flexNftBpsPerEth / 1 ether;
    uint256 result = uint256(flexNftBpsMin) + extra;
    if (result > flexNftBpsMax) result = flexNftBpsMax;
    return uint16(result);
  }

  function _availableGnars() internal view returns (uint256) {
    uint256 balance = gnarsToken.balanceOf(address(this));
    if (balance <= flexGnarsReserved) return 0;
    return balance - flexGnarsReserved;
  }

  function _fulfillFlex(uint256 requestId, PendingOpen storage po, uint256 rand) internal {
    uint256 roll = rand % 10_000;
    uint256 rollNft = (rand / 10_000) % 10_000;
    uint256 pick = rand / 10_000 / 10_000;

    bool nothing = roll < po.flexNothingBps;
    bool grantNft = (!nothing && rollNft < po.flexNftBps);
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
