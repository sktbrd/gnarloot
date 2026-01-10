# V4 Deployment Guide

## Prerequisites

1. Chainlink VRF V2+ subscription (on Base)
2. Owner wallet with ETH for gas
3. GNARS token address: `0x0cf0c3b75d522290d7d12c74d7f1f0cc47ccb23b`
4. Treasury address

## Quick Deploy with Frontend

1. Build the contract:
```bash
cd v4
forge build
```

2. Start the frontend:
```bash
cd ../frontend
npm install
npm run dev
```

3. Open http://localhost:5173 and connect your wallet

4. Fill in the deployment form:
   - VRF Coordinator: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634` (Base)
   - Subscription ID: Your Chainlink VRF subscription ID
   - Key Hash: `0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab`
   - Treasury: Your treasury address
   - Owner: Your owner address (auto-filled)
   - Gnars Token: `0x0cf0c3b75d522290d7d12c74d7f1f0cc47ccb23b`
   - Gnars Unit: `1000000000000000000` (1e18)

5. Click "Deploy Contract"

## Deploy with Foundry Script

```bash
cd v4
forge script script/DeployGnarsLootboxV4.s.sol:DeployGnarsLootboxV4 \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify
```

## Post-Deployment Checklist

From `AGENTS.md`:

1. Configure VRF:
```solidity
// Add this contract as a consumer on Chainlink VRF dashboard
// Or use setSubscriptionId if needed
```

2. Allowlist NFTs:
```solidity
setAllowedERC721(nftAddress, true)
```

3. Fund rewards:
```solidity
// Approve Gnars first
depositGnars(amount)

// Approve NFTs first
depositFlexNft(nftAddress, tokenId)
depositFlexNftBatch(nftAddress, [tokenId1, tokenId2, ...])
```

4. Configure flex parameters (optional):
```solidity
setFlexConfig(
  minFlexEth,      // e.g., 0.0002 ether
  flexNothingBps,  // e.g., 20 (0.2%)
  flexNftBpsMin,   // e.g., 50 (0.5%)
  flexNftBpsMax,   // e.g., 50 (0.5%)
  flexNftBpsPerEth,// e.g., 0
  flexGnarsBase,   // e.g., 500e18
  flexGnarsPerEth  // e.g., 10000e18
)
```

5. Test opening a box:
```solidity
openFlexBox{value: 0.0002 ether}()
```

## Frontend Features

The V4 frontend (`AppV4.jsx`) includes:

### User Features
- Open Flex Box with configurable ETH payment
- View real-time preview of rewards
- See contract stats (NFTs available, Gnars balance)

### Admin Features
- Deploy new V4 contract
- Allowlist NFTs
- Deposit Gnars tokens
- Deposit Flex NFTs
- Update treasury
- Configure flex parameters
- Pause/unpause contract

## Testing

```bash
cd v4
forge test
forge test -vvv  # verbose output
```

## Contract Address

After deployment, update `GNARS_ADDRESSES.lootbox` in your gnars-website configuration.

## Events

Listen for these events:
- `OpenRequested(requestId, user, paid)` - User opened a box
- `FlexOpened(requestId, user, paid, gnarsAmount, nft, tokenId, nothing)` - VRF fulfilled
