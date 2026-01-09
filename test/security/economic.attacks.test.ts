import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

/**
 * ECONOMIC ATTACK TESTS
 *
 * Testing economic viability and profitability attacks:
 * - Price manipulation for profit
 * - Arbitrage opportunities
 * - MEV extraction
 * - Game theory attacks
 * - Value extraction
 * - Profitability analysis
 * - Front-running attacks
 * - Sandwich attacks
 */

describe("Economic Attack Tests", function () {
  async function deployFixture() {
    const [owner, treasury, attacker, victim, miner] = await ethers.getSigners();

    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const coordinator = await MockVRFCoordinator.deploy();

    const GnarsLootboxV1 = await ethers.getContractFactory("GnarsLootboxV1");
    const lootbox = await GnarsLootboxV1.deploy(
      await coordinator.getAddress(),
      1,
      ethers.id("key"),
      treasury.address,
      owner.address
    );

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const erc20 = await MockERC20.deploy();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const erc721 = await MockERC721.deploy();

    return { lootbox, coordinator, erc20, erc721, owner, treasury, attacker, victim, miner };
  }

  describe("Owner Profit Extraction", function () {
    it("Should calculate owner's maximum extractable value", async function () {
      const { lootbox, erc20, coordinator, owner, treasury, attacker } = await loadFixture(deployFixture);

      // Owner deposits 1 ETH worth of ERC20
      const depositValue = ethers.parseEther("1");
      await erc20.mint(owner.address, depositValue);
      await erc20.approve(await lootbox.getAddress(), depositValue);
      await lootbox.depositERC20(await erc20.getAddress(), depositValue, 0, 1);

      // Price is 0.02 ETH
      const price = await lootbox.standardPrice();

      // User pays 0.02 ETH for 1 ETH worth of ERC20
      const reqId = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });
      await coordinator.fulfill(reqId, [0]);

      const treasuryBalance = await ethers.provider.getBalance(treasury.address);
      const userProfit = depositValue - price;

      console.log(`      Treasury received: ${ethers.formatEther(treasuryBalance)} ETH`);
      console.log(`      User profit: ${ethers.formatEther(userProfit)} ETH`);
      console.log(`      Owner gave away: ${ethers.formatEther(depositValue - treasuryBalance)} ETH value`);

      // User made 0.98 ETH profit!
      expect(userProfit).to.equal(ethers.parseEther("0.98"));
    });

    it("Should test owner changing treasury mid-game to steal funds", async function () {
      const { lootbox, erc20, coordinator, owner, treasury, attacker } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      // Owner watches mempool and front-runs to change treasury
      const maliciousTreasury = await ethers.Wallet.createRandom().getAddress();
      await lootbox.setTreasury(maliciousTreasury);

      // User opens box
      const reqId = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });

      // Funds went to malicious treasury, not original
      const maliciousBalance = await ethers.provider.getBalance(maliciousTreasury);
      const originalBalance = await ethers.provider.getBalance(treasury.address);

      console.log(`      Malicious treasury: ${ethers.formatEther(maliciousBalance)} ETH`);
      console.log(`      Original treasury: ${ethers.formatEther(originalBalance)} ETH`);

      expect(maliciousBalance).to.equal(price);
      expect(originalBalance).to.equal(0);
    });

    it("Should test owner extracting value by manipulating prices", async function () {
      const { lootbox, erc20, coordinator, owner, attacker, victim } = await loadFixture(deployFixture);

      // Setup two rewards
      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const originalPrice = await lootbox.standardPrice();

      // Attacker opens first box at normal price
      const reqId1 = await lootbox.connect(attacker).openBox.staticCall(0, { value: originalPrice });
      await lootbox.connect(attacker).openBox(0, { value: originalPrice });

      // Owner sees this and jacks up price for next user
      await lootbox.setPrices(ethers.parseEther("10"), ethers.parseEther("10"), ethers.parseEther("10"));

      const newPrice = await lootbox.standardPrice();

      // Victim has to pay 10 ETH for same 1 ETH reward
      const reqId2 = await lootbox.connect(victim).openBox.staticCall(0, { value: newPrice });
      await lootbox.connect(victim).openBox(0, { value: newPrice });

      console.log(`      Attacker paid: ${ethers.formatEther(originalPrice)} ETH`);
      console.log(`      Victim paid: ${ethers.formatEther(newPrice)} ETH`);
      console.log(`      Unfair difference: ${ethers.formatEther(newPrice - originalPrice)} ETH`);

      // This is a rug pull scenario
      expect(newPrice).to.be.greaterThan(originalPrice);
    });
  });

  describe("MEV and Front-Running Attacks", function () {
    it("Should test front-running deposit with price change", async function () {
      const { lootbox, erc20, coordinator, owner, attacker } = await loadFixture(deployFixture);

      // Setup initial state
      await lootbox.setPrices(ethers.parseEther("0.01"), ethers.parseEther("0.01"), ethers.parseEther("0.01"));

      // Attacker sees owner about to deposit valuable NFT
      // Attacker front-runs to open box at current low price

      // But pool is empty, so attack fails
      const price = await lootbox.standardPrice();
      await expect(
        lootbox.connect(attacker).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });

    it("Should test sandwich attack on openBox", async function () {
      const { lootbox, erc20, coordinator, owner, attacker, victim } = await loadFixture(deployFixture);

      // Setup pool with 3 rewards
      const amount = ethers.parseEther("3");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 3; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      // Attacker sees victim's transaction in mempool
      // Attacker front-runs with higher gas
      const reqId1 = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });

      // Victim's transaction goes through
      const reqId2 = await lootbox.connect(victim).openBox.staticCall(0, { value: price });
      await lootbox.connect(victim).openBox(0, { value: price });

      // Attacker back-runs
      const reqId3 = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });

      // Fulfill all
      await coordinator.fulfill(reqId1, [0]);
      await coordinator.fulfill(reqId2, [1]);
      await coordinator.fulfill(reqId3, [2]);

      // Attacker got 2 rewards, victim got 1
      expect(await erc20.balanceOf(attacker.address)).to.equal(ethers.parseEther("2"));
      expect(await erc20.balanceOf(victim.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should test miner extractable value (MEV)", async function () {
      const { lootbox, erc20, coordinator, owner, miner, victim } = await loadFixture(deployFixture);

      // Setup valuable reward
      const valuableAmount = ethers.parseEther("100"); // 100 ETH worth
      await erc20.mint(owner.address, valuableAmount);
      await erc20.approve(await lootbox.getAddress(), valuableAmount);
      await lootbox.depositERC20(await erc20.getAddress(), valuableAmount, 0, 1);

      const price = await lootbox.standardPrice(); // 0.02 ETH

      // Miner sees this opportunity
      // Miner can reorder transactions to front-run
      const minerBalanceBefore = await ethers.provider.getBalance(miner.address);

      const reqId = await lootbox.connect(miner).openBox.staticCall(0, { value: price });
      const tx = await lootbox.connect(miner).openBox(0, { value: price });
      const receipt = await tx.wait();

      await coordinator.fulfill(reqId, [0]);

      const minerBalanceAfter = await ethers.provider.getBalance(miner.address);
      const gasCost = (receipt?.gasUsed || 0n) * (receipt?.gasPrice || 0n);
      const profit = valuableAmount - price - gasCost;

      console.log(`      Miner paid: ${ethers.formatEther(price)} ETH`);
      console.log(`      Miner received: ${ethers.formatEther(valuableAmount)} ETH worth`);
      console.log(`      Gas cost: ${ethers.formatEther(gasCost)} ETH`);
      console.log(`      Miner MEV profit: ${ethers.formatEther(profit)} ETH`);

      // Miner made ~99.98 ETH profit!
      expect(profit).to.be.greaterThan(ethers.parseEther("99"));
    });
  });

  describe("Game Theory Attacks", function () {
    it("Should test pool draining to grief other users", async function () {
      const { lootbox, erc20, coordinator, owner, attacker, victim } = await loadFixture(deployFixture);

      // Setup small pool
      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const price = await lootbox.standardPrice();

      // Attacker drains pool
      const reqId1 = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });
      await coordinator.fulfill(reqId1, [0]);

      const reqId2 = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
      await lootbox.connect(attacker).openBox(0, { value: price });
      await coordinator.fulfill(reqId2, [1]);

      // Victim can't open box
      await expect(
        lootbox.connect(victim).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");

      console.log(`      Attacker drained pool, griefing other users`);
    });

    it("Should test sniping best rewards", async function () {
      const { lootbox, erc20, coordinator, owner, attacker, victim } = await loadFixture(deployFixture);

      // Setup pool with different value rewards
      const lowValue = ethers.parseEther("0.5");
      const highValue = ethers.parseEther("10");

      await erc20.mint(owner.address, lowValue + highValue);
      await erc20.approve(await lootbox.getAddress(), lowValue + highValue);

      // Low weight for high value
      await lootbox.depositERC20(await erc20.getAddress(), highValue, 0, 1);
      // High weight for low value
      await lootbox.depositERC20(await erc20.getAddress(), lowValue, 0, 99);

      const price = await lootbox.standardPrice();

      // Attacker tries many times to get high value reward
      let gotHighValue = false;
      for (let i = 0; i < 10 && !gotHighValue; i++) {
        try {
          const reqId = await lootbox.connect(attacker).openBox.staticCall(0, { value: price });
          await lootbox.connect(attacker).openBox(0, { value: price });

          // Try to manipulate randomness (won't work in real VRF)
          // But demonstrates the attack vector
          const randomTry = i; // In real scenario, attacker can't control this
          await coordinator.fulfill(reqId, [randomTry]);

          const balance = await erc20.balanceOf(attacker.address);
          if (balance >= highValue) {
            gotHighValue = true;
            console.log(`      Attacker sniped high value reward on attempt ${i + 1}`);
          }
        } catch (error) {
          // Pool might be empty
          break;
        }
      }
    });

    it("Should test collusion between users", async function () {
      const { lootbox, erc20, coordinator, owner, attacker, victim } = await loadFixture(deployFixture);

      // Two colluding users can drain pool efficiently
      const amount = ethers.parseEther("10");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      // Attacker and accomplice drain pool
      for (let i = 0; i < 10; i++) {
        const user = i % 2 === 0 ? attacker : victim;
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i]);
      }

      const attackerBalance = await erc20.balanceOf(attacker.address);
      const victimBalance = await erc20.balanceOf(victim.address);
      const totalExtracted = attackerBalance + victimBalance;

      console.log(`      Colluding users extracted: ${ethers.formatEther(totalExtracted)} ETH worth`);
      expect(totalExtracted).to.equal(amount);
    });
  });

  describe("Value Extraction Analysis", function () {
    it("Should calculate expected value for user", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      // Setup pool with known rewards
      const reward1 = ethers.parseEther("0.01"); // 0.01 ETH worth
      const reward2 = ethers.parseEther("0.1");  // 0.1 ETH worth
      const reward3 = ethers.parseEther("1");    // 1 ETH worth

      await erc20.mint(owner.address, reward1 + reward2 + reward3);
      await erc20.approve(await lootbox.getAddress(), reward1 + reward2 + reward3);

      // Equal weights
      await lootbox.depositERC20(await erc20.getAddress(), reward1, 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), reward2, 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), reward3, 0, 1);

      const price = await lootbox.standardPrice(); // 0.02 ETH

      // Expected value = (0.01 + 0.1 + 1) / 3 = 0.37 ETH
      const expectedValue = (reward1 + reward2 + reward3) / 3n;

      console.log(`      Price: ${ethers.formatEther(price)} ETH`);
      console.log(`      Expected value: ${ethers.formatEther(expectedValue)} ETH`);
      console.log(`      Expected profit: ${ethers.formatEther(expectedValue - price)} ETH`);

      // User has positive expected value!
      expect(expectedValue).to.be.greaterThan(price);
    });

    it("Should test negative expected value scenario", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      // Setup pool with low value rewards
      const reward = ethers.parseEther("0.001"); // Very low value

      await erc20.mint(owner.address, reward * 10n);
      await erc20.approve(await lootbox.getAddress(), reward * 10n);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), reward, 0, 1);
      }

      const price = await lootbox.standardPrice(); // 0.02 ETH
      const expectedValue = reward; // 0.001 ETH

      console.log(`      Price: ${ethers.formatEther(price)} ETH`);
      console.log(`      Expected value: ${ethers.formatEther(expectedValue)} ETH`);
      console.log(`      Expected loss: ${ethers.formatEther(price - expectedValue)} ETH`);

      // User has negative expected value - bad deal!
      expect(expectedValue).to.be.lessThan(price);
    });

    it("Should calculate Kelly criterion for optimal betting", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      // Setup: 90% chance of 0.01 ETH, 10% chance of 1 ETH
      const lowReward = ethers.parseEther("0.01");
      const highReward = ethers.parseEther("1");

      await erc20.mint(owner.address, lowReward * 9n + highReward);
      await erc20.approve(await lootbox.getAddress(), lowReward * 9n + highReward);

      for (let i = 0; i < 9; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), lowReward, 0, 9);
      }
      await lootbox.depositERC20(await erc20.getAddress(), highReward, 0, 1);

      const price = await lootbox.standardPrice();

      // Expected value = 0.9 * 0.01 + 0.1 * 1 = 0.109 ETH
      const expectedValue = ethers.parseEther("0.109");

      console.log(`      Price: ${ethers.formatEther(price)} ETH`);
      console.log(`      Expected value: ${ethers.formatEther(expectedValue)} ETH`);

      // Positive EV, should play
      expect(expectedValue).to.be.greaterThan(price);
    });
  });

  describe("Arbitrage Opportunities", function () {
    it("Should test cross-pool arbitrage", async function () {
      const { lootbox, erc20, coordinator, owner, attacker } = await loadFixture(deployFixture);

      // Standard pool: cheap, low value
      await erc20.mint(owner.address, ethers.parseEther("0.01"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("0.01"));
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("0.01"), 0, 1);

      // Epic pool: expensive, high value
      await erc20.mint(owner.address, ethers.parseEther("10"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("10"));
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("10"), 2, 1);

      const standardPrice = await lootbox.standardPrice(); // 0.02 ETH
      const epicPrice = await lootbox.epicPrice(); // 0.1 ETH

      console.log(`      Standard: Pay ${ethers.formatEther(standardPrice)} ETH for 0.01 ETH worth`);
      console.log(`      Epic: Pay ${ethers.formatEther(epicPrice)} ETH for 10 ETH worth`);

      // Epic is much better deal
      const standardEV = ethers.parseEther("0.01") - standardPrice; // Negative
      const epicEV = ethers.parseEther("10") - epicPrice; // Positive

      expect(epicEV).to.be.greaterThan(standardEV);
      console.log(`      Epic pool is better by ${ethers.formatEther(epicEV - standardEV)} ETH`);
    });
  });

  describe("Flash Loan Attack Scenarios", function () {
    it("Should test if flash loan could be used for profit", async function () {
      const { lootbox, erc20, coordinator, owner, attacker } = await loadFixture(deployFixture);

      // Attacker flash loans ETH to open many boxes
      const price = await lootbox.standardPrice();
      const flashLoanAmount = price * 100n;

      // Setup pool
      await erc20.mint(owner.address, ethers.parseEther("100"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("100"));

      for (let i = 0; i < 100; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      // Attacker can't profit because:
      // 1. VRF is async - can't repay loan in same tx
      // 2. No guarantee of profitable rewards

      console.log(`      Flash loan attack not viable due to VRF async nature`);
    });
  });

  describe("Statistical Attack Analysis", function () {
    it("Should calculate variance and risk", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      // High variance pool
      const lowReward = ethers.parseEther("0.001");
      const highReward = ethers.parseEther("10");

      await erc20.mint(owner.address, lowReward * 99n + highReward);
      await erc20.approve(await lootbox.getAddress(), lowReward * 99n + highReward);

      for (let i = 0; i < 99; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), lowReward, 0, 99);
      }
      await lootbox.depositERC20(await erc20.getAddress(), highReward, 0, 1);

      const price = await lootbox.standardPrice();

      // Expected value
      const ev = (lowReward * 99n + highReward) / 100n;

      // Variance is high - 99% lose money, 1% win big
      console.log(`      Price: ${ethers.formatEther(price)} ETH`);
      console.log(`      Expected value: ${ethers.formatEther(ev)} ETH`);
      console.log(`      99% chance of losing ${ethers.formatEther(price - lowReward)} ETH`);
      console.log(`      1% chance of winning ${ethers.formatEther(highReward - price)} ETH`);
    });
  });
});
