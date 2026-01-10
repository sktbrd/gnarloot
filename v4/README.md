# Gnars Lootbox V4

**Contract:** `GnarsLootboxV4.sol`
**Status:** **RECOMMENDED** for new deployments
**Deployed Address:** TBD

## Overview

V4 is the **streamlined, production-ready** lootbox contract that focuses exclusively on the **flex box** model with **full admin control**. By removing the legacy 3-tier bundle system, V4 delivers a simpler, more gas-efficient, and more flexible contract that's easier to operate and maintain.

**Use V4 if you want:**
- Flex-only lootboxes (pay-what-you-want model)
- Dynamic NFT probability scaling
- Complete admin control over deposited assets
- Simplified contract with less attack surface
- Batch deposit operations
- Modern, maintainable codebase

## What's New in V4

### 1. Flex-Only Architecture

V4 **removes all bundle box functionality** (Standard, Gnarly, Epic) and focuses solely on the flex box model. This eliminates:
- ~200 lines of unused bundle code
- 3 separate pool structs
- Complex bundle validation logic
- Weight-based bundle selection
- Reserved GNARS accounting for bundles

**Result:** Cleaner codebase, lower gas costs, simpler operations.

### 2. Complete Admin Withdrawal System

The most significant improvement in V4 is **full admin control** over all assets:

```solidity
// Withdraw unused GNARS tokens
withdrawGnars(address to, uint256 amount)

// Withdraw any other ERC20 tokens
withdrawERC20(address token, address to, uint256 amount)

// Withdraw specific flex NFT
withdrawFlexNft(address nft, uint256 tokenId, address to)

// Withdraw any other ERC721
withdrawERC721(address nft, uint256 tokenId, address to)

// Withdraw accumulated ETH
withdrawETH(address payable to, uint256 amount)
```

**Why This Matters:**

In V1-V3, once you deposited rewards, they were **locked** until consumed via box openings. This created operational problems:
- Can't remove unpopular NFTs
- Can't reclaim excess GNARS
- Can't recover from deposit mistakes
- Forced to "burn" rewards through discounted opens

V4 solves this with **granular withdrawal controls** that respect reservation logic:
- Can only withdraw GNARS not reserved for pending opens
- Can only withdraw flex NFTs not reserved for pending opens
- Safety checks prevent breaking pending fulfillments

### 3. NFT Index Mapping for Safe Withdrawals

V4 introduces `flexNftIndex` mapping to track deposited NFTs:

```solidity
mapping(address => mapping(uint256 => uint256)) private flexNftIndex;
```

**Benefits:**
- Prevents duplicate NFT deposits (protects against operator error)
- O(1) lookup for withdrawal operations (no linear scan)
- Ensures only flex NFTs can be withdrawn via `withdrawFlexNft()`
- Other NFTs must use `withdrawERC721()` (prevents mixing pools)

### 4. Batch NFT Deposit Function

New `depositFlexNftBatch()` for efficient bulk deposits:

```solidity
depositFlexNftBatch(address nft, uint256[] calldata tokenIds)
```

**Example:**
```solidity
// Deposit 10 NFTs in one transaction
uint256[] memory ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
lootbox.depositFlexNftBatch(nftContract, ids);
```

**Saves:**
- Gas costs (batch approval + transfer)
- Time (one transaction vs many)
- Complexity (simpler scripts)

### 5. Simplified State Management

V4 removes bundle-related state variables:

**Removed:**
```solidity
- Pool private standardPool;
- Pool private gnarlyPool;
- Pool private epicPool;
- uint256 public totalReservedGnars;  // Bundles reserved
- uint256 public standardPrice;
- uint256 public gnarlyPrice;
- uint256 public epicPrice;
```

**Result:** Lower deployment costs, simpler storage layout, easier auditing.

### 6. Streamlined PendingOpen Struct

Simpler pending open tracking without box type enum:

```solidity
struct PendingOpen {
    address user;
    uint256 paid;                  // Amount paid
    uint256 flexGnarsPayout;       // GNARS to receive
    uint16 flexNothingBps;         // Snapshot: nothing chance
    uint16 flexNftBps;             // Snapshot: NFT chance
    bool fulfilled;
    bool flexNftReserved;
    // No boxType field needed!
}
```

## Architecture Comparison

| Feature | V1 | V2 | V3 | V4 |
|---------|----|----|----|----|
| Fixed-price boxes | ✅ | ✅ | ✅ | ❌ |
| Flex boxes | ❌ | ✅ | ✅ | ✅ |
| Dynamic NFT scaling | ❌ | ❌ | ✅ | ✅ |
| Bundle rewards | ❌ | ✅ | ✅ | ❌ |
| Admin withdrawals | ❌ | ❌ | ❌ | ✅ |
| Batch deposits | ❌ | ❌ | ❌ | ✅ |
| Recovery functions | ❌ | ✅ | ✅ | ✅ |
| NFT dedup protection | ❌ | ❌ | ❌ | ✅ |
| Lines of code | 280 | 503 | 554 | 456 |

## Configuration

V4 inherits all V3 flex configuration:

```solidity
minFlexEth = 0.0002 ether          // Minimum payment
flexNothingBps = 20                // 0.20% chance of nothing
flexNftBpsMin = 50                 // 0.50% NFT chance at min payment
flexNftBpsMax = 50                 // 0.50% NFT chance at any payment (default: no scaling)
flexNftBpsPerEth = 0               // NFT odds increase per ETH (default: 0 = no scaling)
flexGnarsBase = 500 * gnarsUnit    // Base GNARS amount
flexGnarsPerEth = 10000 * gnarsUnit // Additional GNARS per ETH paid
```

To enable scaling, set:
```solidity
setFlexConfig(
    0.0002 ether,  // minFlexEth
    20,            // flexNothingBps (0.20%)
    50,            // flexNftBpsMin (0.50%)
    500,           // flexNftBpsMax (5.00%)
    10000,         // flexNftBpsPerEth (adds 1% per 0.01 ETH)
    500 * 1e18,    // flexGnarsBase
    10000 * 1e18   // flexGnarsPerEth
);
```

## Key Functions

### Admin Functions (New in V4)

```solidity
// ---- Batch Deposits ----
depositFlexNftBatch(address nft, uint256[] calldata tokenIds)

// ---- Withdrawals ----
withdrawGnars(address to, uint256 amount)
withdrawERC20(address token, address to, uint256 amount)
withdrawFlexNft(address nft, uint256 tokenId, address to)
withdrawERC721(address nft, uint256 tokenId, address to)
withdrawETH(address payable to, uint256 amount)
```

### Admin Functions (Inherited from V3)

```solidity
setAllowedERC721(address nft, bool allowed)
setTreasury(address payable treasury)
setVrfConfig(uint32 callbackGasLimit, uint16 requestConfirmations,
             uint32 numWords, bytes32 keyHash)
setSubscriptionId(uint256 subscriptionId)
setFlexConfig(uint256 minFlexEth, uint16 flexNothingBps,
              uint16 flexNftBpsMin, uint16 flexNftBpsMax, uint32 flexNftBpsPerEth,
              uint256 flexGnarsBase, uint256 flexGnarsPerEth)
pause() / unpause()

// Single deposits
depositFlexNft(address nft, uint256 tokenId)
depositGnars(uint256 amount)

// Recovery
retryOpen(uint256 requestId)
cancelOpen(uint256 requestId)
```

### User Functions

```solidity
openFlexBox() payable returns (uint256 requestId)

// View functions
getFlexBalances() returns (uint256 flexNftsAvailable, uint256 availableGnars,
                           uint256 reservedGnars)
getFlexPreview(uint256 paid) returns (uint16 nothingBps, uint16 nftBps,
                                       uint256 gnarsPayout)
flexNftsLength() returns (uint256)
getFlexNft(uint256 index) returns (address nft, uint256 tokenId, bool consumed)
```

### Functions Removed from V3

```solidity
// All bundle-related functions removed:
- depositBundle()
- openBox(BoxType)
- getPoolBalances(BoxType)
- setPrices()
```

## Withdrawal Safety

V4 withdrawals respect reservation system:

### GNARS Withdrawals
```solidity
function withdrawGnars(address to, uint256 amount) external onlyOwner {
    require(_availableGnars() >= amount, "insufficient gnars");
    // Can only withdraw: balance - flexGnarsReserved
    gnarsToken.safeTransfer(to, amount);
}
```

### Flex NFT Withdrawals
```solidity
function withdrawFlexNft(address nft, uint256 tokenId, address to) external onlyOwner {
    require(flexNftRemaining > flexNftReserved, "flex nft reserved");
    // Must have at least 1 NFT not reserved for pending opens
    // Marks NFT as consumed, decrements remaining
}
```

**Protection:** Can never withdraw assets needed for pending fulfillments.

## Events (New in V4)

```solidity
event FlexNftWithdrawn(address indexed nft, uint256 indexed tokenId,
                       uint256 flexIndex, address indexed to)
event GnarsWithdrawn(address indexed to, uint256 amount)
event ERC20Withdrawn(address indexed token, address indexed to, uint256 amount)
event ERC721Withdrawn(address indexed nft, address indexed to, uint256 tokenId)
event EthWithdrawn(address indexed to, uint256 amount)
```

All V3 events are also present.

## Testing

Run V4 tests from repository root:
```bash
forge test --root v4
```

## Deployment

### Foundry Script

Set environment variables (same as V2/V3):
```bash
export VRF_COORDINATOR=0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634
export VRF_SUBSCRIPTION_ID=<your_subscription_id>
export VRF_KEY_HASH=0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab
export GNARS_TREASURY=<treasury_address>
export GNARS_INITIAL_OWNER=<owner_address>
export GNARS_TOKEN=<gnars_token_address>
export GNARS_UNIT=1000000000000000000  # 1e18 for 18 decimals
```

Deploy:
```bash
forge script --root v4 script/DeployGnarsLootboxV4.s.sol:DeployGnarsLootboxV4 \
  --rpc-url $BASE_RPC_URL --broadcast
```

### Post-Deployment Checklist

1. **VRF Setup:**
   - Fund Chainlink VRF subscription with ETH
   - Add deployed contract as consumer

2. **Asset Allowlisting:**
   - Call `setAllowedERC721(nft, true)` for each NFT collection

3. **Initial Deposits:**
   - Deposit GNARS: `depositGnars(amount)`
   - Deposit NFTs (batch): `depositFlexNftBatch(nft, tokenIds)`

4. **Configuration:**
   - Set flex scaling: `setFlexConfig(...)`
   - Verify preview: `getFlexPreview(testAmount)`

5. **Testing:**
   - Test small opening with minimum payment
   - Test medium opening with scaled payment
   - Verify events and rewards

6. **Monitoring:**
   - Watch `FlexOpened` events
   - Monitor balances via `getFlexBalances()`
   - Track pending opens

## Operational Workflows

### Adding New NFTs

```solidity
// 1. Approve NFTs
nftContract.setApprovalForAll(lootboxAddress, true);

// 2. Allowlist collection
lootbox.setAllowedERC721(nftContract, true);

// 3. Batch deposit
uint256[] memory ids = [1, 2, 3, 4, 5];
lootbox.depositFlexNftBatch(nftContract, ids);
```

### Removing Unpopular NFTs

```solidity
// Check availability
(uint256 available, , ) = lootbox.getFlexBalances();
require(available > 0, "all reserved");

// Withdraw specific NFT
lootbox.withdrawFlexNft(nftContract, tokenId, treasuryAddress);
```

### Rebalancing GNARS

```solidity
// Check available GNARS
(, uint256 available, ) = lootbox.getFlexBalances();

// Withdraw excess
if (available > desiredBuffer) {
    lootbox.withdrawGnars(treasury, available - desiredBuffer);
}

// Or deposit more
if (available < desiredBuffer) {
    gnarsToken.approve(lootbox, needed);
    lootbox.depositGnars(needed);
}
```

### Recovering from VRF Failure

```solidity
// Option 1: Retry with new VRF request
uint256 newRequestId = lootbox.retryOpen(failedRequestId);

// Option 2: Cancel and refund (off-chain refund needed)
lootbox.cancelOpen(failedRequestId);
// Then manually refund user via treasury
```

## Economics Example

### Configuration
```solidity
minFlexEth = 0.0002 ETH
flexNothingBps = 20 (0.20%)
flexNftBpsMin = 50 (0.50%)
flexNftBpsMax = 500 (5.00%)
flexNftBpsPerEth = 10000 (1% per 0.01 ETH)
flexGnarsBase = 500 GNARS
flexGnarsPerEth = 10000 GNARS per ETH
```

### User Pays 0.01 ETH
```solidity
// NFT odds calculation:
nftBps = 50 + ((0.01 - 0.0002) * 10000 / 1)
       = 50 + (0.0098 * 10000)
       = 50 + 98
       = 148 bps = 1.48%

// GNARS calculation:
gnars = 500 + (0.01 * 10000)
      = 500 + 100
      = 600 GNARS

// Probabilities:
- 0.20% chance: nothing
- 1.48% chance: 600 GNARS + 1 NFT
- 98.32% chance: 600 GNARS only
```

### User Pays 0.05 ETH
```solidity
// NFT odds calculation:
nftBps = 50 + ((0.05 - 0.0002) * 10000 / 1)
       = 50 + 498
       = 548 bps (capped at flexNftBpsMax = 500)
       = 500 bps = 5.00%

// GNARS calculation:
gnars = 500 + (0.05 * 10000)
      = 500 + 500
      = 1000 GNARS

// Probabilities:
- 0.20% chance: nothing
- 5.00% chance: 1000 GNARS + 1 NFT
- 94.80% chance: 1000 GNARS only
```

## Security Improvements Over V3

1. **NFT Deduplication**: `flexNftIndex` mapping prevents accidental double-deposits
2. **Withdrawal Safeguards**: All withdrawals check reservation system
3. **Simpler Code**: Fewer features = smaller attack surface
4. **No Bundle Complexity**: Eliminates bundle validation and weight logic
5. **Clear Separation**: Flex NFTs tracked separately from other NFTs

## Why Choose V4

### For Operators
- **Full Asset Control**: Withdraw and rebalance at any time
- **Simpler Operations**: No bundle management, just flex
- **Batch Tools**: Efficient bulk NFT deposits
- **Better Monitoring**: `flexNftsLength()` and `getFlexNft()` for inventory
- **Recovery Tools**: Inherited from V2/V3

### For Users
- **Transparent Odds**: `getFlexPreview()` shows exact probabilities
- **Fair Scaling**: Pay more = better odds (capped to prevent whales)
- **Always Available**: No "sold out" tiers, just flex pool
- **Simple UX**: One box type, one interface

### For Developers
- **Cleaner Code**: 100+ fewer lines than V3
- **Modern Patterns**: Better storage layout, safer withdrawals
- **Well-Tested**: Inherits V2/V3 battle-tested VRF logic
- **Easy Auditing**: Single box type, clear invariants

## Migration from V3

V3 users who only use flex boxes can migrate to V4:

1. Deploy V4 contract
2. Deposit GNARS and NFTs into V4
3. Update frontend to point to V4 address
4. Withdraw remaining assets from V3 (once all pending opens fulfilled)

**Note:** If you actively use bundle boxes (Standard/Gnarly/Epic), stay on V3.

## Limitations

- **Flex-only**: No bundle rewards (by design)
- **Linear scan**: Still uses O(n) NFT selection (acceptable for <1000 NFTs)
- **Manual refunds**: Cancelled opens require off-chain user refund

## Future Improvements (Hypothetical V5)

Potential enhancements for future versions:
- Alias method for O(1) NFT selection
- On-chain refund mechanism for cancelled opens
- Multi-tier flex pools with different NFT rarities
- ERC1155 support
- Merkle-proof based eligibility

---

**V4 is the recommended version for all new deployments.** It provides the best balance of features, security, and operational flexibility.
