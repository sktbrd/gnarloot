## Gnars Lootbox V1

Gnars Lootbox V1 is a VRF‑secured lootbox contract on Base that sells three tiers of boxes (Standard, Gnarly, Epic) and transfers one pre‑deposited reward per box (ERC20 or ERC721).

This README is written for a junior dev who is new to the project and needs to take over operations safely.

### Core Constants (Base Mainnet)

- **VRF Coordinator (v2.5):** `0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634`
- **Key Hash (low gas lane):** `0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab`
- **VRF Config:**
  - `callbackGasLimit`: `400000`
  - `requestConfirmations`: `3`
  - `numWords`: `1`

### Current Test Setup (Update If Changed)

- **Chain:** Base mainnet (chainId `8453`)
- **Latest test contract:** `0x5425186b0dd257130dC7D52ebbA3673cF2a9a08f`
- **Owner (test wallet):** `0x8Bf5941d27176242745B716251943Ae4892a3C26`
- **Treasury (test):** `0x72ad986ebac0246d2b3c565ab2a1ce3a14ce6f88`
- **Subscription ID (v2.5):** `99565515620834636304250522028617269923610402981851221983571694477234087866635`

### Box Types

- `0` = Standard
- `1` = Gnarly
- `2` = Epic

### Reward Types

- `0` = ERC20
- `1` = ERC721

### Contract Overview

Core flow:
1) Admin deposits rewards into pools (ERC20 or ERC721).
2) User calls `openBox(boxType)` with exact ETH price.
3) Contract requests Chainlink VRF (native payment).
4) VRF callback selects a reward by weight and transfers it.

Important notes:
- V1 uses a linear scan to select a reward. Keep pool sizes small.
- No minting in the lootbox. All rewards must be pre‑deposited.
- VRF is async. Reward arrives only after fulfillment.

### Deploy (Frontend)

There is a simple React deploy UI in `frontend/` that uses your injected wallet (no private keys required).

```
cd frontend
npm install
npm run dev -- --host
```

Use the UI to deploy, then add the deployed address as a consumer on your VRF subscription.

### Deploy (Foundry Script)

The script `script/DeployGnarsLootboxV1.s.sol` reads from env vars:
- `VRF_COORDINATOR`
- `SUBSCRIPTION_ID`
- `KEY_HASH`
- `TREASURY`
- `INITIAL_OWNER`

Example:
```
export VRF_COORDINATOR=0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634
export SUBSCRIPTION_ID=99565515620834636304250522028617269923610402981851221983571694477234087866635
export KEY_HASH=0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab
export TREASURY=0x72ad986ebac0246d2b3c565ab2a1ce3a14ce6f88
export INITIAL_OWNER=0x8Bf5941d27176242745B716251943Ae4892a3C26
forge script script/DeployGnarsLootboxV1.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

### VRF Subscription Setup (Base)

1) Create a VRF v2.5 subscription in the Chainlink VRF UI.
2) Fund the subscription with native ETH.
3) Add the lootbox contract as a **consumer**.
4) Ensure the contract uses the **same coordinator** as the subscription:
   - If mismatched, call `setCoordinator(<coordinator>)` and `setVrfConfig(...)`.

### Configure VRF After Deploy

If you deployed with the wrong coordinator or keyHash, fix it without redeploying:
1) Call `setCoordinator(0x0d5D517aBE5cF79B7e95eC98dB0f0277788aFF634)`
2) Call `setVrfConfig(400000, 3, 1, 0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab)`

### Admin Functions (Owner)

- Allowlist ERC721 contracts:
  - `setAllowedERC721(nft, true)`
- Update treasury:
  - `setTreasury(treasury)`
- Update prices:
  - `setPrices(standard, gnarly, epic)`
- Update VRF config:
  - `setVrfConfig(callbackGasLimit, requestConfirmations, numWords, keyHash)`

### Deposits

**ERC20**
1) Approve lootbox to spend:
   - `approve(lootbox, amount)`
2) Deposit:
   - `depositERC20(token, amount, boxType, weight)`

**ERC721**
1) Allowlist:
   - `setAllowedERC721(nft, true)`
2) Approve:
   - `approve(lootbox, tokenId)`
3) Deposit:
   - `depositERC721(nft, tokenId, boxType, weight)`

### Open a Box (User Flow)

1) Read on‑chain price:
   - `standardPrice()` / `gnarlyPrice()` / `epicPrice()`
2) Call `openBox(boxType)` with **exact** ETH value.
3) Wait for VRF fulfillment (async).
4) Reward is transferred in `fulfillRandomWords`.

### Open a Box (User)

Call `openBox(boxType)` with **exact** ETH value equal to the on‑chain price:
- `standardPrice()` / `gnarlyPrice()` / `epicPrice()`

The VRF fulfillment will call `fulfillRandomWords` and transfer the reward.

### Events You Should Watch

- `RewardDeposited` (admin deposits)
- `OpenRequested` (openBox call succeeded)
- `BoxOpened` (reward transferred)
- `AllowedERC721Updated`, `TreasuryUpdated`

### Common Failure Modes

- **OpenBox reverts with "invalid key hash":**
  - Your `keyHash` does not match the coordinator or lane.
  - Fix by calling `setCoordinator` and `setVrfConfig`.
- **OpenBox reverts before tx hash (estimateGas fail):**
  - Wrong price, empty pool, or totalWeight == 0.
  - Check `standardPrice()` and that rewards were deposited.
- **VRF pending but no fulfillment:**
  - Subscription has no ETH or contract not added as consumer.

### Pool Management Tips

- Keep rewards list small to keep fulfill gas low.
- Each reward has its own weight. Higher weight = higher chance.
- `remaining` is the number of unconsumed rewards in that pool.

### Foundry

```
forge build
forge test
```

### Frontend Notes

- The `frontend/` UI is for local testing and deployment only.
- It connects via injected wallet (Coinbase/MetaMask).
- If openBox shows a staticCall revert, use the "Force Send" button.
