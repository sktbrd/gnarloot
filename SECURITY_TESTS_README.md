# Gnars Lootbox Security Test Suite

Comprehensive security testing suite for Gnars Lootbox V1 and V2 contracts using Hardhat and TypeScript.

## Overview

This test suite provides extensive security coverage including:

- **Reentrancy attacks**
- **Access control vulnerabilities**
- **Treasury manipulation**
- **Price manipulation**
- **Weight manipulation**
- **VRF manipulation**
- **Griefing attacks**
- **Malicious token contracts**
- **Pausable mechanism**
- **Edge cases and overflow protection**
- **Production contract validation** (with spend limits)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
BASE_RPC_URL=https://mainnet.base.org  # Your Base RPC URL
FORK_ENABLED=false                      # Enable for production tests
RUN_REAL_TXS=false                      # Enable to send real transactions (use with caution)
REPORT_GAS=false                        # Enable gas reporting
```

## Running Tests

### Run All Security Tests

```bash
npm run test:security
```

### Run V1 Security Tests Only

```bash
npm run test:v1
```

### Run V2 Security Tests Only

```bash
npm run test:v2
```

### Run Production Contract Tests

**IMPORTANT**: Production tests analyze the deployed contract on Base mainnet with a **0.001 ETH spend limit**.

```bash
# Enable forking first
FORK_ENABLED=true npm run test:prod
```

To enable real transactions (within 0.001 ETH limit):

```bash
FORK_ENABLED=true RUN_REAL_TXS=true npm run test:prod
```

## Test Categories

### GnarsLootboxV1 Security Tests (`test/security/GnarsLootboxV1.security.test.ts`)

1. **Reentrancy Protection**
   - OpenBox reentrancy attacks
   - Malicious ERC20 reentrancy on transfer
   - VRF callback protection

2. **Access Control**
   - Unauthorized admin function calls
   - SetAllowedERC721, setTreasury, setPrices, pause/unpause
   - depositERC20/ERC721 restrictions

3. **Treasury Manipulation**
   - Zero address treasury
   - Malicious treasury rejecting payments
   - Treasury changes mid-game

4. **Price Manipulation**
   - Price changes affecting pending opens
   - Extremely high prices
   - Zero prices
   - Wrong price payments

5. **Weight Manipulation**
   - Zero weight deposits
   - Maximum weight values
   - Weight distribution fairness

6. **VRF Security**
   - Unknown request IDs
   - Double fulfillment
   - Coordinator changes

7. **Griefing Attacks**
   - Pool draining
   - Empty pool attacks

8. **Pausable Mechanism**
   - OpenBox when paused
   - Fulfillment when paused
   - Pause/unpause cycles

9. **Malicious Token Contracts**
   - ERC721 rejecting transfers
   - ERC20 rejecting transfers
   - Reentrancy attempts via tokens

10. **Edge Cases**
    - Zero amount deposits
    - Empty pools
    - Multiple pool isolation
    - Reward consumption
    - NFT allowlist enforcement

### GnarsLootboxV2 Security Tests (`test/security/GnarsLootboxV2.security.test.ts`)

All V1 tests plus:

1. **Bundle Deposit Security**
   - GNARS amount restrictions (1k, 5k, 10k, 100k)
   - Flex pool protection
   - NFT count limits (1-3)
   - Array length matching
   - Weight validation

2. **GNARS Reservation Accounting**
   - Reserved GNARS tracking
   - Available GNARS calculation
   - Flex box insufficient GNARS prevention

3. **Flex Box Security**
   - Minimum flex ETH enforcement
   - Empty NFT pool handling
   - NFT reservation on open
   - BPS validation

4. **Cancel/Retry Attack Vectors**
   - Reservation release on cancel
   - Double cancel prevention
   - Owner-only retry
   - Pending open data preservation

5. **Reentrancy and Access Control**
   - Admin function protection
   - OpenBox reentrancy guard
   - OpenFlexBox reentrancy guard

6. **Edge Cases and Overflow Protection**
   - Flex payout calculation overflow
   - Empty bundle pools
   - Pool isolation

### Production Contract Tests (`test/security/production.test.ts`)

**Deployed Contract**: `0xEB793fc0D366FE7C6d0407f181CF5F6b49CE59b1`
**Spend Limit**: `0.001 ETH`

1. **Read-Only Security Analysis**
   - Contract deployment verification
   - Price verification
   - Treasury address check
   - VRF configuration
   - Pause state

2. **Owner and Access Control**
   - Owner identification
   - Multisig verification
   - Unauthorized access prevention

3. **Price Manipulation Tests**
   - Non-owner price change attempts
   - Price consistency verification

4. **State Verification**
   - Contract balance check
   - State variable readability

5. **Limited Interaction Tests**
   - OpenBox simulation (staticCall)
   - Exact price requirement
   - Box type price validation
   - Optional real transaction (if RUN_REAL_TXS=true)

6. **Security Report**
   - Comprehensive summary
   - Recommendations
   - Spend tracking

## Helper Contracts

The test suite includes helper contracts for testing (`test/security/helpers/SecurityTestHelpers.sol`):

- `MockVRFCoordinator` - VRF coordinator simulation
- `MockERC20` - Standard ERC20 token
- `MockERC721` - Standard ERC721 token
- `MaliciousERC20` - ERC20 with reentrancy attempts
- `MaliciousERC721` - ERC721 that can reject transfers
- `ReentrantAttacker` - Contract attempting reentrancy
- `MaliciousTreasury` - Treasury that rejects payments

## Safety Features

### Production Test Safeguards

1. **Spend Limit**: Hard-coded 0.001 ETH maximum spend
2. **Static Calls**: Most tests use `staticCall` (no state changes)
3. **Opt-in Real Transactions**: Set `RUN_REAL_TXS=true` explicitly
4. **Spend Tracking**: Cumulative spend monitoring
5. **Fork-Only**: Production tests require `FORK_ENABLED=true`

### Best Practices

- Always run production tests on a fork first
- Never commit `.env` file with real private keys
- Review all tests before enabling `RUN_REAL_TXS`
- Monitor gas costs in reports
- Verify contract addresses before testing

## Test Output

Tests provide detailed console output including:

- ✓ Successful security checks
- ⚠️ Warnings for potential issues
- Gas usage reports (if enabled)
- Transaction details
- Security recommendations

Example output:
```
=== Production Contract Security Analysis ===
Contract: 0xEB793fc0D366FE7C6d0407f181CF5F6b49CE59b1
Network: Base Mainnet (chainId 8453)
Spend Limit: 0.001 ETH

Current Prices:
  Standard: 0.02 ETH
  Gnarly: 0.05 ETH
  Epic: 0.1 ETH

✓ Contract deployed (12000 bytes)
✓ Access control verified
✓ Price manipulation prevented
✓ Exact price enforcement verified
```

## Security Findings

The test suite will identify:

- ❌ Critical vulnerabilities (test failures)
- ⚠️ Warnings for potential issues (logged)
- ✓ Passing security checks (verified)

## Continuous Integration

To integrate with CI/CD:

```yaml
# .github/workflows/security-tests.yml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:security
```

## Troubleshooting

### Common Issues

1. **"Cannot find module" errors**
   ```bash
   npm install
   ```

2. **Fork tests failing**
   ```bash
   # Verify RPC URL is set
   echo $BASE_RPC_URL
   # Enable forking
   export FORK_ENABLED=true
   ```

3. **Transaction reverts**
   - Check contract is not paused
   - Verify prices are correct
   - Ensure pools have rewards
   - Review error messages in test output

4. **Gas estimation failures**
   - Contract may be paused
   - Pool may be empty
   - Price may have changed

## Contributing

When adding new security tests:

1. Follow existing test patterns
2. Add descriptive test names
3. Include console output for important findings
4. Document any new attack vectors
5. Update this README

## License

MIT

## Disclaimer

These tests are for security analysis only. Running tests against production contracts carries risk. Always:

- Test on a fork first
- Respect spend limits
- Never share private keys
- Verify contract addresses
- Review code before execution

The test suite is provided as-is with no guarantees. Use at your own risk.
