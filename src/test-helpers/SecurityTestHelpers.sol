// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {IERC721Receiver} from "openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol";
import {VRFConsumerBaseV2Plus} from "chainlink/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "chainlink/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IVRFCoordinatorV2Plus} from "chainlink/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {GnarsLootboxV1} from "../GnarsLootboxV1.sol";

// Mock VRF Coordinator for testing
contract MockVRFCoordinator is IVRFCoordinatorV2Plus, VRFConsumerBaseV2Plus {
    uint256 public nextRequestId = 1;
    mapping(uint256 => address) public consumers;

    constructor() VRFConsumerBaseV2Plus(address(this)) {}

    function fulfillRandomWords(uint256, uint256[] calldata) internal pure override {}

    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata)
        external
        override
        returns (uint256 requestId)
    {
        requestId = nextRequestId++;
        consumers[requestId] = msg.sender;
    }

    function fulfill(uint256 requestId, uint256[] memory randomWords) external {
        address consumer = consumers[requestId];
        require(consumer != address(0), "unknown request");
        VRFConsumerBaseV2Plus(consumer).rawFulfillRandomWords(requestId, randomWords);
    }

    // Unused IVRFSubscriptionV2Plus methods
    function addConsumer(uint256, address) external override {}
    function removeConsumer(uint256, address) external override {}
    function cancelSubscription(uint256, address) external override {}
    function acceptSubscriptionOwnerTransfer(uint256) external override {}
    function requestSubscriptionOwnerTransfer(uint256, address) external override {}
    function createSubscription() external pure override returns (uint256) {
        return 0;
    }
    function getSubscription(uint256)
        external
        pure
        override
        returns (uint96, uint96, uint64, address, address[] memory consumers_)
    {
        consumers_ = new address[](0);
        return (0, 0, 0, address(0), consumers_);
    }
    function pendingRequestExists(uint256) external pure override returns (bool) {
        return false;
    }
    function getActiveSubscriptionIds(uint256, uint256) external pure override returns (uint256[] memory ids) {
        ids = new uint256[](0);
    }
    function fundSubscriptionWithNative(uint256) external payable override {}
}

// Mock ERC20 token
contract MockERC20 is ERC20("MockToken", "MOCK") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Mock ERC721 token
contract MockERC721 is ERC721("MockNFT", "MNFT") {
    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}

// Malicious ERC20 that attempts reentrancy
contract MaliciousERC20 is ERC20("MalToken", "MAL") {
    address public target;
    bool public rejectTransfers;

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTarget(address _target) external {
        target = _target;
    }

    function setRejectTransfers(bool _reject) external {
        rejectTransfers = _reject;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (rejectTransfers) {
            return false;
        }

        // Try to reenter on transfer
        if (target != address(0) && to != address(0)) {
            try GnarsLootboxV1(payable(target)).openBox{value: 0.02 ether}(GnarsLootboxV1.BoxType.Standard) {
                // Reentrancy attempt
            } catch {
                // Expected to fail due to reentrancy guard
            }
        }

        return super.transfer(to, amount);
    }
}

// Malicious ERC721 that rejects transfers
contract MaliciousERC721 is ERC721("MalNFT", "MNFT") {
    bool public rejectTransfers;

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function setRejectTransfers(bool _reject) external {
        rejectTransfers = _reject;
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        if (rejectTransfers) {
            revert("Transfer rejected");
        }
        super.transferFrom(from, to, tokenId);
    }
}

// Reentrancy attacker
contract ReentrantAttacker is IERC721Receiver {
    GnarsLootboxV1 private lootbox;
    uint256 private attackCount;

    constructor(GnarsLootboxV1 _lootbox) {
        lootbox = _lootbox;
    }

    function attack() external payable {
        attackCount = 0;
        lootbox.openBox{value: msg.value}(GnarsLootboxV1.BoxType.Standard);
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            // Try to reenter
            lootbox.openBox{value: lootbox.standardPrice()}(GnarsLootboxV1.BoxType.Standard);
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

// Treasury that rejects payments
contract MaliciousTreasury {
    receive() external payable {
        revert("I reject your payment");
    }
}
