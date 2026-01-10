# Gnars Lootbox V2

**Contract:** `GnarsLootboxV2.sol`
**Status:** Active (superseded by V3 and V4 for new deployments)
**Deployed Address:** TBD

## Overview

V2 introduces **bundle rewards** (GNARS token + 1–3 NFTs together) and a **flex box** option where users can pay any amount above a minimum to get GNARS and a small chance at an NFT. This version adds significant flexibility over V1's single-reward system.

## What's New in V2

### Bundle Rewards
- Multiple rewards in a single box opening
- Every bundle includes **both** GNARS tokens and 1–3 NFTs
- GNARS amount must be **exactly** one of: 1,000 / 5,000 / 10,000 / 100,000 (in token units)
- Bundle rarity is controlled by `weight`

### Flex Box System
- User pays any ETH >= `minFlexEth` (default: 0.0002 ETH)
- Probabilistic outcomes:
  - Tiny chance of "nothing" (0.20%)
  - Small chance of 1 NFT (0.50%)
  - Otherwise receives GNARS tokens
- GNARS payout scales with payment: `flexGnarsBase + (paid * flexGnarsPerEth / 1 ether)`

### GNARS Reservation System
- Bundle GNARS amounts are reserved when deposited
- Prevents flex box payouts from spending bundle rewards
- Separate accounting for bundle vs flex GNARS pools

### Admin Recovery Functions
- `retryOpen(requestId)`: Retry failed VRF requests
- `cancelOpen(requestId)`: Cancel stuck opens and release reserves

## Core Rules

## Configuration Defaults (Owner Settable)

- `minFlexEth`: `0.0002 ether`
- `flexNothingBps`: `20` (0.20%)
- `flexNftBps`: `50` (0.50%)
- `flexGnarsBase`: `500 GNARS`
- `flexGnarsPerEth`: `10,000 GNARS / 1 ETH`

## Box Types

V2 maintains the 3-tier system from V1 and adds Flex:

```solidity
enum BoxType {
    Standard,  // = 0 (bundles)
    Gnarly,    // = 1 (bundles)
    Epic,      // = 2 (bundles)
    Flex       // = 3 (flex rewards)
}
```

## Key Functions

### Admin Functions (New in V2)

```solidity
// Deposit a bundle (GNARS + 1-3 NFTs)
depositBundle(address[] nftContracts, uint256[] nftIds, uint256 gnarsAmount,
              BoxType boxType, uint32 weight)

// Deposit NFT for flex pool
depositFlexNft(address nft, uint256 tokenId)

// Deposit GNARS for flex pool
depositGnars(uint256 amount)

// Configure flex box probabilities and payouts
setFlexConfig(uint256 minFlexEth, uint16 flexNothingBps, uint16 flexNftBps,
              uint256 flexGnarsBase, uint256 flexGnarsPerEth)

// Recovery: retry failed VRF request
retryOpen(uint256 requestId) returns (uint256 newRequestId)

// Recovery: cancel stuck open and release reserves
cancelOpen(uint256 requestId)
```

### User Functions (New in V2)

```solidity
// Open flex box with any payment >= minFlexEth
openFlexBox() payable returns (uint256 requestId)

// View pool balances
getPoolBalances(BoxType boxType) returns (uint256 totalGnars, uint256 totalNfts,
                                           uint256 remainingBundles, uint256 totalWeight)

// View flex balances
getFlexBalances() returns (uint256 flexNftsAvailable, uint256 availableGnars,
                           uint256 reservedGnars)
```

### Inherited from V1

All V1 functions remain available:
- `openBox(BoxType)` for Standard/Gnarly/Epic boxes
- `setPrices()`, `setAllowedERC721()`, `setTreasury()`, etc.

## Price Strategy (Economics)

Treat GNARS as a gift (cost = 0 for pricing).
Goal: **>= 0.015 ETH per NFT on average**.

Flex box example:
```
minFlexEth = 0.0002 ETH
pNFT = 0.50% = 0.005
expected ETH per NFT = 0.0002 / 0.005 = 0.04 ETH
```
This is safely above 0.015 ETH target.

## Important Notes

- Flex box reverts if NFT pool is empty and `flexNftBps > 0`
- GNARS for bundles is **reserved** so flex payouts can't spend it
- All config values are owner-settable for test vs production tuning
- Bundle GNARS amounts are validated against allowed values (1K, 5K, 10K, 100K)
- Flex probabilities must sum to <= 100% (flexNothingBps + flexNftBps <= 10000)

## Testing

Run V2 tests from repository root:
```bash
forge test --root v2
```

## Deployment

### Foundry Script

Set environment variables:
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
forge script --root v2 script/DeployGnarsLootboxV2.s.sol:DeployGnarsLootboxV2 \
  --rpc-url $BASE_RPC_URL --broadcast
```

### Post-Deployment

1. Fund Chainlink VRF subscription with ETH
2. Add deployed contract as VRF consumer
3. Allowlist ERC721 contracts
4. Deposit GNARS tokens for flex pool
5. Deposit flex NFTs
6. Deposit bundles for Standard/Gnarly/Epic boxes
7. Test with small openings before production

## Events (New in V2)

```solidity
event BundleDeposited(BoxType indexed boxType, uint256 gnarsAmount,
                      uint32 weight, uint256 bundleIndex)

event FlexNftDeposited(address indexed nft, uint256 indexed tokenId, uint256 flexIndex)

event GnarsDeposited(uint256 amount)

event BundleOpened(uint256 indexed requestId, address indexed user,
                   BoxType indexed boxType, uint256 gnarsAmount, uint256 bundleIndex)

event FlexOpened(uint256 indexed requestId, address indexed user, uint256 paid,
                 uint256 gnarsAmount, address nft, uint256 tokenId, bool nothing)

event OpenRetried(uint256 indexed oldRequestId, uint256 indexed newRequestId)

event OpenCancelled(uint256 indexed requestId, address indexed user,
                    BoxType indexed boxType, uint256 paid)

event FlexConfigUpdated(uint256 minFlexEth, uint16 flexNothingBps, uint16 flexNftBps,
                        uint256 flexGnarsBase, uint256 flexGnarsPerEth)
```

## Improvements Over V1

1. **Bundle Rewards**: Multi-item rewards (GNARS + NFTs) vs single item
2. **Flex Pricing**: Pay-what-you-want vs fixed prices only
3. **Recovery Functions**: Can retry/cancel stuck opens
4. **GNARS Reservation**: Prevents flex from spending bundle rewards
5. **Better Accounting**: Separate tracking for bundle vs flex pools
6. **More Events**: Better observability for off-chain systems

## Limitations

- Flex NFT odds are still **fixed** (same probability regardless of payment amount)
- No admin withdrawal functions (must consume rewards via opens)
- Still uses linear scan for bundle selection (keep pools small)

See [../v3/README.md](../v3/README.md) for dynamic flex scaling improvements.
