# V4 Frontend Setup Complete

## What Was Updated

The frontend has been updated to work exclusively with the V4 contract:

### New Files Created

1. **`frontend/src/v4-abi.js`** - V4 contract ABI extracted from compiled contract
2. **`frontend/src/AppV4.jsx`** - New React component for V4 deployment and interaction
3. **`frontend/public/v4-bytecode.txt`** - Contract bytecode for browser-based deployment
4. **`v4/DEPLOYMENT.md`** - Comprehensive deployment guide
5. **`v4/README.md`** - V4 contract documentation

### Modified Files

1. **`frontend/src/main.jsx`** - Updated to use AppV4 instead of App
   - Changed import from `App` to `AppV4`
   - Updated app name to "Gnars Lootbox V4 Deploy"

## Frontend Features

### Deployment
- Deploy V4 contract directly from browser
- Pre-filled with Base mainnet defaults
- Auto-connects to user's wallet

### User Interface
- **Open Flex Box**: Pay ETH to open a lootbox
- **View Balances**: See available NFTs and Gnars in contract
- **Preview Rewards**: See expected rewards before opening
- **Real-time Stats**: Contract status, balances, and configuration

### Admin Dashboard
- **Pause Control**: Pause/unpause contract
- **Allowlist NFTs**: Add/remove allowed NFT contracts
- **Deposit Gnars**: Add Gnars tokens to reward pool
- **Deposit NFTs**: Add NFTs to flex pool
- **Set Treasury**: Update treasury address
- **Configure Flex**: Adjust reward parameters

## How to Use

### 1. Build the V4 Contract

```bash
cd v4
forge build
```

This generates:
- Contract ABI at `v4/out/GnarsLootboxV4.sol/GnarsLootboxV4.json`
- Bytecode for deployment

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Navigate to http://localhost:5173

### 3. Deploy V4 Contract

1. Connect your wallet (must be on Base network)
2. Fill in deployment parameters:
   - **VRF Coordinator**: Pre-filled for Base
   - **Subscription ID**: Your Chainlink VRF subscription
   - **Key Hash**: Pre-filled for Base
   - **Treasury**: Address to receive ETH payments
   - **Owner**: Auto-filled with your address
   - **Gnars Token**: Pre-filled with Base Gnars token
   - **Gnars Unit**: 1e18 (standard ERC20 decimals)
3. Click "Deploy Contract"
4. Wait for deployment confirmation
5. Contract address will appear on screen

### 4. Configure Contract (Admin)

After deployment, use the admin controls to:

1. **Add VRF Consumer**: Go to Chainlink VRF dashboard and add your deployed contract address
2. **Allowlist NFTs**: Use "Allowlist NFT" section to enable NFT contracts
3. **Deposit Rewards**:
   - Approve Gnars token first
   - Use "Deposit Gnars" to add Gnars rewards
   - Approve NFTs and use "Deposit Flex NFT"
4. **Configure Parameters** (optional): Adjust flex box settings

### 5. Test Opening a Box

1. Enter ETH amount (minimum 0.0002 ETH by default)
2. View preview of rewards
3. Click "Open Flex Box"
4. Wait for transaction confirmation
5. VRF will fulfill request asynchronously
6. Check events for results

## Contract Defaults

The frontend pre-fills these Base mainnet addresses:

- **VRF Coordinator**: `0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634`
- **Key Hash**: `0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab`
- **Treasury**: `0x8Bf5941d27176242745B716251943Ae4892a3C26`
- **Gnars Token**: `0x0cf0c3b75d522290d7d12c74d7f1f0cc47ccb23b`

## Production Build

To build for production:

```bash
cd frontend
npm run build
```

Outputs to `frontend/dist/`

## Troubleshooting

### "v4-bytecode.txt not found"
Run `forge build` in the `v4/` directory first.

### Deployment fails
- Ensure you're on Base network
- Check you have enough ETH for gas
- Verify all addresses are correct

### VRF not fulfilling
- Add contract as consumer on Chainlink dashboard
- Ensure VRF subscription has LINK
- Check subscription ID is correct

## Next Steps

After successful deployment:

1. Update `GNARS_ADDRESSES.lootbox` in gnars-website with new contract address
2. Test opening boxes on testnet first
3. Fund contract with Gnars and NFTs
4. Monitor events for box openings
5. Consider setting up event listeners for automated notifications

## Reference

- See `v4/DEPLOYMENT.md` for detailed deployment guide
- See `v4/README.md` for contract documentation
- See `AGENTS.md` for operational checklist
