# Gnars Lootbox V3

**Contract:** `GnarsLootboxV3.sol`
**Status:** Active (superseded by V4 for new deployments)
**Deployed Address:** TBD

## Overview

V3 introduces **dynamic flex scaling** where NFT probabilities increase based on the payment amount. This creates a more engaging economic model where users who pay more get better odds of winning NFTs, while maintaining all the bundle and flex features from V2.

## What's New in V3

### Dynamic Flex NFT Probability Scaling

The breakthrough feature of V3 is **payment-dependent NFT odds**:

- **flexNftBpsMin**: Minimum NFT chance at `minFlexEth` payment
- **flexNftBpsMax**: Maximum NFT chance (cap)
- **flexNftBpsPerEth**: How much NFT odds increase per ETH paid

**Formula:**
```solidity
nftBps = min(flexNftBpsMin + ((paid - minFlexEth) * flexNftBpsPerEth / 1 ether), flexNftBpsMax)
```

**Example:**
```
minFlexEth = 0.0002 ETH
flexNftBpsMin = 50 bps (0.50%)
flexNftBpsMax = 500 bps (5.00%)
flexNftBpsPerEth = 10000 bps per ETH

Payment: 0.0002 ETH → 0.50% NFT chance
Payment: 0.001 ETH → 0.58% NFT chance
Payment: 0.01 ETH → 1.48% NFT chance
Payment: 0.05 ETH → 5.00% NFT chance (capped at max)
```

This creates a **progressive incentive** for larger payments while protecting against whale exploitation via the max cap.

### Snapshot-Based Fulfillment

V3 stores the NFT odds (`flexNftBps`) and nothing chance (`flexNothingBps`) at request time in the `PendingOpen` struct. This ensures:
- Odds can't change between open and fulfillment
- Admin can safely update config without affecting pending opens
- Users get exactly the odds they paid for

### Subscription ID Update Function

New admin function `setSubscriptionId()` allows changing VRF subscription without redeployment. Useful for:
- Migrating to a new VRF subscription
- Switching between test and production subscriptions

### Flex Preview Function

New view function `getFlexPreview(uint256 paid)` lets users simulate outcomes **before** paying:
```solidity
(uint16 nothingBps, uint16 nftBps, uint256 gnarsPayout) = getFlexPreview(0.01 ether);
// Returns: nothingBps=20, nftBps=148, gnarsPayout=100500
```

This improves UX by showing users exactly what odds and GNARS amount they'll get for their payment.

## Configuration Defaults

- `minFlexEth`: `0.0002 ether`
- `flexNothingBps`: `20` (0.20%)
- `flexNftBpsMin`: `50` (0.50% at minimum payment)
- `flexNftBpsMax`: `50` (0.50% - no scaling by default, must be configured)
- `flexNftBpsPerEth`: `0` (no scaling by default)
- `flexGnarsBase`: `500 * gnarsUnit`
- `flexGnarsPerEth`: `10,000 * gnarsUnit`

## Box Types

Same as V2:

```solidity
enum BoxType {
    Standard,  // = 0 (bundles)
    Gnarly,    // = 1 (bundles)
    Epic,      // = 2 (bundles)
    Flex       // = 3 (flex rewards with dynamic scaling)
}
```

## Key Functions

### Admin Functions (New in V3)

```solidity
// Set VRF subscription ID (new in V3)
setSubscriptionId(uint256 _subscriptionId)

// Configure flex with dynamic NFT scaling (updated signature)
setFlexConfig(
    uint256 _minFlexEth,
    uint16 _flexNothingBps,
    uint16 _flexNftBpsMin,      // NEW: min NFT odds
    uint16 _flexNftBpsMax,      // NEW: max NFT odds
    uint32 _flexNftBpsPerEth,   // NEW: odds increase per ETH
    uint256 _flexGnarsBase,
    uint256 _flexGnarsPerEth
)
```

### User Functions (New in V3)

```solidity
// Preview flex box outcomes for a given payment (new in V3)
getFlexPreview(uint256 paid) returns (
    uint16 nothingBps,
    uint16 nftBps,
    uint256 gnarsPayout
)
```

### Inherited from V2

All V2 functions remain available:
- `depositBundle()`, `depositFlexNft()`, `depositGnars()`
- `openBox()`, `openFlexBox()`
- `retryOpen()`, `cancelOpen()`
- `getPoolBalances()`, `getFlexBalances()`

## How Flex Scaling Works

### 1. User Preview (Optional)
```solidity
// Check odds before opening
(uint16 nothingBps, uint16 nftBps, uint256 gnars) = getFlexPreview(0.005 ether);
```

### 2. User Opens Flex Box
```solidity
// Pay 0.005 ETH to open
openFlexBox{value: 0.005 ether}();
```

### 3. Contract Calculates and Stores Odds
```solidity
uint16 nftBps = _flexNftBpsForPaid(msg.value);  // Calculate based on payment
pendingOpens[requestId] = PendingOpen({
    ...
    flexNothingBps: flexNothingBps,  // Snapshot current config
    flexNftBps: nftBps,                // Snapshot calculated odds
    ...
});
```

### 4. VRF Fulfillment Uses Snapshot
```solidity
// Uses the snapshot odds, not current config
bool nothing = roll < po.flexNothingBps;
bool grantNft = (!nothing && rollNft < po.flexNftBps);
```

## Events (New in V3)

```solidity
event SubscriptionIdUpdated(uint256 subscriptionId)

event FlexConfigUpdated(
    uint256 minFlexEth,
    uint16 flexNothingBps,
    uint16 flexNftBpsMin,     // NEW
    uint16 flexNftBpsMax,     // NEW
    uint32 flexNftBpsPerEth,  // NEW
    uint256 flexGnarsBase,
    uint256 flexGnarsPerEth
)
```

All V2 events are also present.

## Testing

Run V3 tests from repository root:
```bash
forge test --root v3
```

## Deployment

### Foundry Script

Set environment variables (same as V2):
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
forge script --root v3 script/DeployGnarsLootboxV3.s.sol:DeployGnarsLootboxV3 \
  --rpc-url $BASE_RPC_URL --broadcast
```

### Post-Deployment

Same as V2, but additionally:
1. Configure flex scaling parameters via `setFlexConfig()`:
   - Set `flexNftBpsMax` > `flexNftBpsMin` to enable scaling
   - Set `flexNftBpsPerEth` to control scaling rate
2. Test various payment amounts to verify scaling curve
3. Use `getFlexPreview()` to validate economics

## Improvements Over V2

1. **Dynamic NFT Probability**: Odds scale with payment amount vs fixed odds
2. **Snapshot Fulfillment**: Odds locked at request time vs using current config
3. **Preview Function**: Users can simulate before paying vs blind opening
4. **Subscription Management**: Can update VRF subscription ID vs locked at deploy
5. **Progressive Economics**: Rewards larger payments while capping whale advantage

## Economic Design Benefits

### Incentivizes Higher Payments
Users are motivated to pay more for better NFT odds, increasing revenue per open.

### Caps Whale Exploitation
`flexNftBpsMax` prevents wealthy users from achieving guaranteed wins.

### Transparent Odds
`getFlexPreview()` builds trust by showing exact probabilities upfront.

### Flexible Tuning
Admin can adjust the scaling curve without redeployment to optimize for:
- Market conditions
- NFT scarcity
- Revenue targets

## Limitations

- No admin withdrawal functions (must consume rewards via opens)
- Still uses linear scan for bundle/flex selection (keep pools small)
- Still has 3-tier bundle boxes (V4 removes these for flex-only design)

## Migration to V4

V4 is **flex-only** and removes bundle boxes entirely. Migrate to V4 if you:
- Only want flex functionality (simpler contract)
- Need admin withdrawal capabilities
- Want batch NFT deposit functions
- Don't need Standard/Gnarly/Epic bundle tiers

See [../v4/README.md](../v4/README.md) for full details on V4's streamlined design.
