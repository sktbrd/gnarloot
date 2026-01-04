## Gnars Lootbox V2

V2 introduces **bundle rewards** (GNARS + 1–3 NFTs together) and a **flex box** option where users can pay any amount above a minimum to get GNARS and a small chance at an NFT.

### V2 Core Rules

- Every bundle includes **both** GNARS and 1–3 NFTs.
- GNARS amount must be **exactly** one of:
  - 1,000 / 5,000 / 10,000 / 100,000 (in token units).
- Bundle rarity is controlled by `weight`.
- Flex box: user pays any ETH >= `minFlexEth`.
  - Tiny chance of “nothing”.
  - Small chance of 1 NFT.
  - Otherwise receives GNARS.

### V2 Defaults (Owner Settable)

- `minFlexEth`: `0.0002 ether`
- `flexNothingBps`: `20` (0.20%)
- `flexNftBps`: `50` (0.50%)
- `flexGnarsBase`: `500 GNARS`
- `flexGnarsPerEth`: `10,000 GNARS / 1 ETH`

### V2 Price Strategy (DAO Argument)

Treat GNARS as a gift (cost = 0 for pricing).  
Goal: **>= 0.015 ETH per NFT on average**.

Flex box example:
```
minFlexEth = 0.0002 ETH
pNFT = 0.50% = 0.005
expected ETH per NFT = 0.0002 / 0.005 = 0.04 ETH
```
This is safely above 0.015 ETH.

### V2 Contract Additions

- `depositBundle(nftContracts[], nftIds[], gnarsAmount, boxType, weight)`
- `depositFlexNft(nft, tokenId)`
- `depositGnars(amount)` (for flex GNARS reserve)
- `openFlexBox()`
- `getPoolBalances(boxType)`
- `getFlexBalances()`
- `setFlexConfig(...)`
- `retryOpen(requestId)` (owner)
- `cancelOpen(requestId)` (owner)

### V2 Notes

- Flex box reverts if NFT pool is empty and `flexNftBps > 0`.
- GNARS for bundles is **reserved** so flex payouts can’t spend it.
- All config values are owner‑settable for test vs production tuning.

### V2 Tests

Run from repo root:
```
forge test --root v2
```

### V2 Deploy Script (Foundry)

Run from repo root with environment variables:
```
VRF_COORDINATOR=0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634
VRF_SUBSCRIPTION_ID=YOUR_SUB_ID
VRF_KEY_HASH=0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab
GNARS_TREASURY=0x...
GNARS_INITIAL_OWNER=0x...
GNARS_TOKEN=0x...
GNARS_UNIT=1000000000000000000
```

Then:
```
forge script --root v2 script/DeployGnarsLootboxV2.s.sol:DeployGnarsLootboxV2 --rpc-url $RPC_URL --broadcast
```
