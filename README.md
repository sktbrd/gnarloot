# Gnars Lootbox V4

This repo is **V4‑only** for active development. V1/V2/V3 are **deprecated** and kept for reference.

## Layout

- `v4/` - **active** Flex‑only lootbox contract (deploy from here).
- `v1/`, `v2/`, `v3/` - legacy versions (do not deploy).
- `frontend/` - legacy deploy UI (deprecated).

## V4 Contract Summary

V4 is a **Flex‑only** lootbox:
- Users pay any ETH >= `minFlexEth`.
- If “nothing” does not hit, they receive GNARS.
- They may also receive an NFT based on `flexNftBps` odds.

Owner operations:
- Config: `setFlexConfig`, `setVrfConfig`, `setSubscriptionId`, `setTreasury`, `setAllowedERC721`.
- Deposits: `depositGnars`, `depositFlexNft`, `depositFlexNftBatch`.
- Control: `pause`, `unpause`, `retryOpen`, `cancelOpen`.
- Withdrawals/Rescue: `withdrawGnars`, `withdrawERC20`, `withdrawFlexNft`, `withdrawERC721`, `withdrawETH`.

Views:
- `getFlexBalances`, `getFlexPreview`, `gnarsUnit`, `minFlexEth`, `flexNothingBps`, `flexNftBpsMin/Max/PerEth`.

## Deploy (V4)

Use the `v4/` folder with Foundry.

```
cd v4
forge build
```

Deploy with the provided script (recommended):

```
export VRF_COORDINATOR=0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634
export VRF_SUBSCRIPTION_ID=123
export VRF_KEY_HASH=0x...
export GNARS_TREASURY=0x...
export GNARS_INITIAL_OWNER=0x...
export GNARS_TOKEN=0x...
export GNARS_UNIT=1000000000000000000

forge script script/DeployGnarsLootboxV4.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

Deploy with your preferred method (`forge create`) if you don’t want the script.  
After deploy:
1) Add the contract as a **consumer** on the Chainlink VRF subscription.
2) Set VRF config (`setVrfConfig`) and `subscriptionId`.
3) Allowlist NFTs, deposit GNARS + NFTs.
4) Update the frontend config with the new address.

## Frontend

The live UI is in **`gnars-website`** (separate repo).  
Update `GNARS_ADDRESSES.lootbox` after each deploy.

## Legacy Versions

V1/V2/V3 are kept for reference only. Do not deploy them.  
If you need historical context, see `v1/`, `v2/`, `v3/`.
