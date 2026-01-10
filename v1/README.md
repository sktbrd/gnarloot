# Gnars Lootbox V1

**Contract:** `GnarsLootboxV1.sol`
**Status:** Legacy (superseded by V2, V3, V4)
**Deployed Address:** TBD

## Overview

V1 is the original VRF-secured lootbox contract that implements a classic 3-tier mystery box system on Base. Users purchase boxes with fixed ETH prices and receive random ERC20 or ERC721 rewards via Chainlink VRF v2.5.

## Core Features

### Three Box Tiers
- **Standard Box**: Entry-level tier (default: 0.02 ETH)
- **Gnarly Box**: Mid-tier (default: 0.05 ETH)
- **Epic Box**: Premium tier (default: 0.1 ETH)

Each tier has its own separate reward pool with independent pricing.

### Reward Types
- **ERC20 Tokens**: Fungible token rewards with configurable amounts
- **ERC721 NFTs**: Non-fungible token rewards (must be allowlisted)

### Weighted Distribution
Each reward has a `weight` value that determines its probability of being selected. Higher weight = higher chance.

### VRF Integration
Uses Chainlink VRF v2.5 for cryptographically secure randomness:
- **VRF Coordinator:** `0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634` (Base mainnet)
- **Key Hash:** `0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab`
- **Callback Gas Limit:** 400,000
- **Request Confirmations:** 3

## Key Functions

### Admin Functions
```solidity
// Allowlist ERC721 contracts
setAllowedERC721(address nft, bool allowed)

// Configure box prices
setPrices(uint256 standard, uint256 gnarly, uint256 epic)

// Deposit ERC20 reward
depositERC20(address token, uint256 amount, BoxType boxType, uint16 weight)

// Deposit ERC721 reward
depositERC721(address token, uint256 tokenId, BoxType boxType, uint16 weight)

// Update treasury address
setTreasury(address payable treasury)

// Update VRF configuration
setVrfConfig(uint32 callbackGasLimit, uint16 requestConfirmations, uint32 numWords, bytes32 keyHash)

// Pause/unpause contract
pause() / unpause()
```

### User Functions
```solidity
// Open a box (requires exact ETH payment)
openBox(BoxType boxType) payable returns (uint256 requestId)
```

## How It Works

1. **Admin deposits rewards** into one of three pools (Standard, Gnarly, Epic)
2. **User calls `openBox(boxType)`** with exact ETH payment
3. **ETH is forwarded to treasury** immediately
4. **VRF request is made** to Chainlink for random number
5. **VRF callback** (`fulfillRandomWords`) selects and transfers reward asynchronously
6. **Reward is marked consumed** and removed from available pool

## Events

```solidity
event RewardDeposited(BoxType indexed boxType, RewardType indexed rewardType,
                      address indexed token, uint256 amount, uint256 tokenId,
                      uint16 weight, uint256 rewardIndex)

event OpenRequested(uint256 indexed requestId, address indexed user,
                    BoxType indexed boxType, uint256 pricePaid)

event BoxOpened(uint256 indexed requestId, address indexed user,
                BoxType indexed boxType, RewardType rewardType,
                address token, uint256 amount, uint256 tokenId, uint256 rewardIndex)
```

## Limitations

### Linear Scan Selection
V1 uses a linear scan algorithm to select rewards (v1/src/GnarsLootboxV1.sol:265-277). This means:
- Gas costs increase with pool size
- Keep reward pools small (< 50 items recommended)
- Consumed rewards are skipped during scan but still take up space

### No Admin Recovery
V1 lacks administrative recovery functions:
- No way to retry failed VRF requests
- No way to cancel stuck opens
- No way to withdraw rewards after deposit

### No Flex Pricing
All boxes require exact ETH payment. No flexible "pay what you want" option.

### No Bundle Rewards
Each box opening awards only ONE reward (either ERC20 or ERC721), not multiple items together.

## Box Types Enum

```solidity
enum BoxType {
    Standard,  // = 0
    Gnarly,    // = 1
    Epic       // = 2
}
```

## Reward Types Enum

```solidity
enum RewardType {
    ERC20,   // = 0
    ERC721   // = 1
}
```

## Testing

Run V1 tests from repository root:
```bash
forge test --root v1
```

## Deployment

### Foundry Script

Set environment variables:
```bash
export VRF_COORDINATOR=0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634
export SUBSCRIPTION_ID=<your_chainlink_subscription_id>
export KEY_HASH=0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab
export TREASURY=<treasury_address>
export INITIAL_OWNER=<owner_address>
```

Deploy:
```bash
forge script --root v1 script/DeployGnarsLootboxV1.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

### Post-Deployment

1. Fund your Chainlink VRF subscription with ETH
2. Add the deployed contract as a consumer on your VRF subscription
3. Allowlist any ERC721 contracts you plan to use
4. Deposit rewards into pools
5. Test with a small opening before going live

## Migration Path

V1 is considered legacy. For new deployments:

- **Use V2** if you need bundle rewards (GNARS + NFTs together) and flex boxes
- **Use V3** if you need dynamic flex scaling based on payment amount
- **Use V4** if you only need flex boxes and want admin withdrawal capabilities (RECOMMENDED)

V1 should only be used if you specifically need the simple 3-tier fixed-price model without any advanced features.

## Security Considerations

- All ETH is forwarded to treasury immediately (no ETH stored in contract)
- Rewards must be pre-deposited (no minting)
- VRF callback is the only way to fulfill openings
- Owner can pause the contract in emergencies
- No way to recover from failed VRF fulfillments (upgrade to V2+ for recovery)

## Changes in V2

V2 adds:
- Bundle rewards (GNARS token + 1-3 NFTs)
- Flex box with pay-what-you-want pricing
- GNARS reservation system
- Admin recovery functions (retryOpen, cancelOpen)
- Configurable flex probabilities

See [../v2/README.md](../v2/README.md) for details.
