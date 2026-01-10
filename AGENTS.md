# AGENTS

Scope: **V4 only.** V1/V2/V3 are deprecated and kept for reference.

Primary contract:
- `v4/src/GnarsLootboxV4.sol`

Operational checklist:
- Configure VRF: `setVrfConfig`, `setSubscriptionId`, add consumer on Chainlink.
- Allowlist NFTs: `setAllowedERC721`.
- Fund rewards: `depositGnars`, `depositFlexNft`/`depositFlexNftBatch`.
- Control: `pause`, `unpause`, `retryOpen`, `cancelOpen`.
- Withdraw/rescue: `withdrawGnars`, `withdrawERC20`, `withdrawFlexNft`, `withdrawERC721`, `withdrawETH`.

Frontend:
- Use the `gnars-website` lootbox page with the **v4 ABI**.
- Update `GNARS_ADDRESSES.lootbox` after each deploy.
