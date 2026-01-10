// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "openzeppelin-contracts/contracts/token/ERC721/IERC721.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

// Chainlink VRF v2.5 via chainlink-brownie-contracts remapping:
import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";

contract GnarsLootboxV1 is VRFConsumerBaseV2Plus, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum BoxType {
        Standard,
        Gnarly,
        Epic
    }
    enum RewardType {
        ERC20,
        ERC721
    }

    struct Reward {
        RewardType rewardType;
        address token;
        uint256 amount;
        uint256 tokenId;
        uint16 weight;
        bool consumed;
    }

    struct PendingOpen {
        address user;
        BoxType boxType;
        bool fulfilled;
    }

    struct Pool {
        Reward[] rewards;
        uint256 totalWeight;
        uint256 remaining;
    }

    Pool private standardPool;
    Pool private gnarlyPool;
    Pool private epicPool;

    mapping(uint256 => PendingOpen) public pendingOpens;

    mapping(address => bool) public allowedERC721;

    uint256 public standardPrice = 0.02 ether;
    uint256 public gnarlyPrice = 0.05 ether;
    uint256 public epicPrice = 0.1 ether;

    address payable public treasury;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit = 400_000;
    uint16 public requestConfirmations = 3;
    uint32 public numWords = 1;

    event AllowedERC721Updated(address indexed nft, bool allowed);
    event TreasuryUpdated(address indexed treasury);

    event RewardDeposited(
        BoxType indexed boxType,
        RewardType indexed rewardType,
        address indexed token,
        uint256 amount,
        uint256 tokenId,
        uint16 weight,
        uint256 rewardIndex
    );

    event OpenRequested(uint256 indexed requestId, address indexed user, BoxType indexed boxType, uint256 pricePaid);

    event BoxOpened(
        uint256 indexed requestId,
        address indexed user,
        BoxType indexed boxType,
        RewardType rewardType,
        address token,
        uint256 amount,
        uint256 tokenId,
        uint256 rewardIndex
    );

    constructor(
        address vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address payable _treasury,
        address initialOwner
    ) VRFConsumerBaseV2Plus(vrfCoordinator) {
        require(initialOwner != address(0), "owner=0");

        if (initialOwner != msg.sender) {
            // ConfirmedOwner (inherited via VRF base) uses a two-step transfer.
            transferOwnership(initialOwner);
        }

        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        treasury = _treasury;
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

    function setVrfConfig(uint32 _callbackGasLimit, uint16 _requestConfirmations, uint32 _numWords, bytes32 _keyHash)
        external
        onlyOwner
    {
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        numWords = _numWords;
        keyHash = _keyHash;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------- Admin: deposits -------
    function depositERC20(address token, uint256 amount, BoxType boxType, uint16 weight) external onlyOwner {
        require(amount > 0, "amount=0");
        require(weight > 0, "weight=0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        Pool storage p = _pool(boxType);
        p.rewards
            .push(
                Reward({
                    rewardType: RewardType.ERC20,
                    token: token,
                    amount: amount,
                    tokenId: 0,
                    weight: weight,
                    consumed: false
                })
            );
        p.totalWeight += weight;
        p.remaining += 1;

        emit RewardDeposited(boxType, RewardType.ERC20, token, amount, 0, weight, p.rewards.length - 1);
    }

    function depositERC721(address token, uint256 tokenId, BoxType boxType, uint16 weight) external onlyOwner {
        require(allowedERC721[token], "erc721 not allowed");
        require(weight > 0, "weight=0");

        IERC721(token).transferFrom(msg.sender, address(this), tokenId);

        Pool storage p = _pool(boxType);
        p.rewards
            .push(
                Reward({
                    rewardType: RewardType.ERC721,
                    token: token,
                    amount: 0,
                    tokenId: tokenId,
                    weight: weight,
                    consumed: false
                })
            );
        p.totalWeight += weight;
        p.remaining += 1;

        emit RewardDeposited(boxType, RewardType.ERC721, token, 0, tokenId, weight, p.rewards.length - 1);
    }

    // ------- User: open box -------
    function openBox(BoxType boxType) external payable nonReentrant whenNotPaused returns (uint256 requestId) {
        uint256 price = _price(boxType);
        require(msg.value == price, "wrong price");

        Pool storage p = _pool(boxType);
        require(p.remaining > 0, "empty pool");
        require(p.totalWeight > 0, "no weight");

        (bool ok,) = treasury.call{value: msg.value}("");
        require(ok, "treasury xfer failed");

        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: numWords,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        });

        requestId = s_vrfCoordinator.requestRandomWords(req);
        pendingOpens[requestId] = PendingOpen({user: msg.sender, boxType: boxType, fulfilled: false});

        emit OpenRequested(requestId, msg.sender, boxType, price);
    }

    // ------- VRF callback -------
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        PendingOpen storage po = pendingOpens[requestId];
        require(po.user != address(0), "unknown request");
        require(!po.fulfilled, "already fulfilled");
        po.fulfilled = true;

        Pool storage p = _pool(po.boxType);

        uint256 rewardIndex = _selectRewardIndex(p, randomWords[0]);
        Reward storage r = p.rewards[rewardIndex];
        require(!r.consumed, "consumed");

        r.consumed = true;
        p.remaining -= 1;
        p.totalWeight -= r.weight;

        if (r.rewardType == RewardType.ERC20) {
            IERC20(r.token).safeTransfer(po.user, r.amount);
            emit BoxOpened(requestId, po.user, po.boxType, RewardType.ERC20, r.token, r.amount, 0, rewardIndex);
        } else {
            IERC721(r.token).safeTransferFrom(address(this), po.user, r.tokenId);
            emit BoxOpened(requestId, po.user, po.boxType, RewardType.ERC721, r.token, 0, r.tokenId, rewardIndex);
        }
    }

    // ------- internals -------
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

    // NOTE: Linear scan selection. Keep pool sizes small in V1.
    // V2 can replace with Fenwick tree / alias method for large pools.
    function _selectRewardIndex(Pool storage p, uint256 rand) internal view returns (uint256) {
        uint256 target = rand % p.totalWeight;
        uint256 cumulative = 0;

        uint256 len = p.rewards.length;
        for (uint256 i = 0; i < len; i++) {
            Reward storage r = p.rewards[i];
            if (r.consumed) continue;
            cumulative += r.weight;
            if (target < cumulative) return i;
        }
        revert("selection failed");
    }

    receive() external payable {}
}
