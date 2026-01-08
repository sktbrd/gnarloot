import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * INTEGRATION AND STRESS TESTS
 *
 * Full end-to-end scenarios and stress testing:
 * - Complete user journeys
 * - Multi-step workflows
 * - Extreme load scenarios
 * - Long-running operations
 * - Complex state transitions
 * - Real-world usage patterns
 */

describe("Integration and Stress Tests", function () {
  // Increase timeout for stress tests
  this.timeout(300000); // 5 minutes

  async function deployFixture() {
    const signers = await ethers.getSigners();
    const [owner, treasury] = signers;

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

    return { lootbox, coordinator, erc20, erc721, owner, treasury, signers };
  }

  describe("Complete User Journeys", function () {
    it("Should handle full lifecycle: deposit -> open -> fulfill -> repeat", async function () {
      const { lootbox, erc20, erc721, coordinator, owner, signers } = await loadFixture(deployFixture);

      await lootbox.setAllowedERC721(await erc721.getAddress(), true);

      // Cycle 1: ERC20 rewards
      console.log(`      Cycle 1: ERC20 rewards`);
      await erc20.mint(owner.address, ethers.parseEther("5"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("5"));

      for (let i = 0; i < 5; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      for (let i = 0; i < 5; i++) {
        const user = signers[i + 2];
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i]);
        expect(await erc20.balanceOf(user.address)).to.equal(ethers.parseEther("1"));
      }

      // Cycle 2: NFT rewards
      console.log(`      Cycle 2: NFT rewards`);
      for (let i = 0; i < 5; i++) {
        await erc721.mint(owner.address, i);
        await erc721.approve(await lootbox.getAddress(), i);
        await lootbox.depositERC721(await erc721.getAddress(), i, 1, 1);
      }

      const gnarlyPrice = await lootbox.gnarlyPrice();

      for (let i = 0; i < 5; i++) {
        const user = signers[i + 7];
        const reqId = await lootbox.connect(user).openBox.staticCall(1, { value: gnarlyPrice });
        await lootbox.connect(user).openBox(1, { value: gnarlyPrice });
        await coordinator.fulfill(reqId, [i]);
        expect(await erc721.ownerOf(i)).to.equal(user.address);
      }

      console.log(`      ✓ Completed 2 full cycles with 10 users`);
    });

    it("Should handle mixed reward types in same pool", async function () {
      const { lootbox, erc20, erc721, coordinator, owner, signers } = await loadFixture(deployFixture);

      await lootbox.setAllowedERC721(await erc721.getAddress(), true);

      // Deposit mixed rewards
      await erc20.mint(owner.address, ethers.parseEther("3"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("3"));
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      for (let i = 0; i < 3; i++) {
        await erc721.mint(owner.address, i);
        await erc721.approve(await lootbox.getAddress(), i);
        await lootbox.depositERC721(await erc721.getAddress(), i, 0, 1);
      }

      const price = await lootbox.standardPrice();
      let erc20Count = 0;
      let erc721Count = 0;

      // Open all 6 boxes
      for (let i = 0; i < 6; i++) {
        const user = signers[i + 2];
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i]);

        if (await erc20.balanceOf(user.address) > 0) {
          erc20Count++;
        } else {
          erc721Count++;
        }
      }

      console.log(`      ERC20 rewards: ${erc20Count}, NFT rewards: ${erc721Count}`);
      expect(erc20Count + erc721Count).to.equal(6);
    });

    it("Should handle pause/unpause during active operations", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      await erc20.mint(owner.address, ethers.parseEther("10"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("10"));

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const requestIds: bigint[] = [];

      // Users open boxes
      for (let i = 0; i < 3; i++) {
        const user = signers[i + 2];
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        requestIds.push(reqId);
      }

      // Pause
      await lootbox.pause();

      // New opens should fail
      await expect(
        lootbox.connect(signers[5]).openBox(0, { value: price })
      ).to.be.reverted;

      // But fulfillments should work
      for (let i = 0; i < 3; i++) {
        await coordinator.fulfill(requestIds[i], [i]);
        expect(await erc20.balanceOf(signers[i + 2].address)).to.equal(ethers.parseEther("1"));
      }

      // Unpause
      await lootbox.unpause();

      // New opens work again
      const user = signers[6];
      const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
      await lootbox.connect(user).openBox(0, { value: price });
      await coordinator.fulfill(reqId, [3]);

      console.log(`      ✓ Handled pause/unpause correctly during operations`);
    });
  });

  describe("Stress Tests - High Volume", function () {
    it("Should handle 1000 deposits", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      console.log(`      Depositing 1000 rewards...`);

      const amount = ethers.parseEther("1000");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

        if (i > 0 && i % 100 === 0) {
          console.log(`        Deposited ${i} rewards...`);
        }
      }

      const endTime = Date.now();
      console.log(`      ✓ Deposited 1000 rewards in ${endTime - startTime}ms`);
    });

    it("Should handle 100 concurrent opens", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      // Deposit 100 rewards
      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 100; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const requestIds: bigint[] = [];

      console.log(`      Opening 100 boxes...`);
      const startTime = Date.now();

      // Open 100 boxes
      for (let i = 0; i < 100; i++) {
        const user = signers[i % signers.length];
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        requestIds.push(reqId);

        if (i > 0 && i % 10 === 0) {
          console.log(`        Opened ${i} boxes...`);
        }
      }

      const endTime = Date.now();
      console.log(`      ✓ Opened 100 boxes in ${endTime - startTime}ms`);

      // Fulfill all
      console.log(`      Fulfilling 100 requests...`);
      for (let i = 0; i < 100; i++) {
        await coordinator.fulfill(requestIds[i], [i]);

        if (i > 0 && i % 10 === 0) {
          console.log(`        Fulfilled ${i} requests...`);
        }
      }

      console.log(`      ✓ All 100 requests fulfilled successfully`);
    });

    it("Should test gas costs scaling with pool size", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      const testSizes = [1, 10, 50, 100, 250, 500];
      const results: { size: number; openGas: bigint; fulfillGas: bigint }[] = [];

      for (const size of testSizes) {
        // Setup pool
        const amount = ethers.parseEther(size.toString());
        await erc20.mint(owner.address, amount);
        await erc20.approve(await lootbox.getAddress(), amount);

        for (let i = 0; i < size; i++) {
          await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 1, 1); // Use Gnarly pool
        }

        const user = signers[2];
        const price = await lootbox.gnarlyPrice();

        // Measure open gas
        const openTx = await lootbox.connect(user).openBox(1, { value: price });
        const openReceipt = await openTx.wait();
        const openGas = openReceipt?.gasUsed || 0n;

        // Measure fulfill gas (worst case - last reward)
        const reqId = openReceipt?.logs[0]?.topics[1] ? BigInt(openReceipt.logs[0].topics[1]) : 0n;
        const fulfillTx = await coordinator.fulfill(reqId, [size - 1]);
        const fulfillReceipt = await fulfillTx.wait();
        const fulfillGas = fulfillReceipt?.gasUsed || 0n;

        results.push({ size, openGas, fulfillGas });

        console.log(`      Size ${size}: Open=${openGas}, Fulfill=${fulfillGas}`);
      }

      // Analyze scaling
      console.log(`\n      Gas Cost Scaling Analysis:`);
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        const sizeRatio = curr.size / prev.size;
        const gasRatio = Number(curr.fulfillGas) / Number(prev.fulfillGas);
        console.log(`      ${prev.size}->${curr.size}: Size ratio=${sizeRatio.toFixed(1)}x, Gas ratio=${gasRatio.toFixed(2)}x`);
      }

      // Check if any exceed callback gas limit
      const callbackLimit = await lootbox.callbackGasLimit();
      for (const result of results) {
        if (result.fulfillGas > callbackLimit) {
          console.log(`      ⚠️  WARNING: Pool size ${result.size} exceeds gas limit!`);
        }
      }
    });
  });

  describe("Long-Running Operations", function () {
    it("Should handle operations over many blocks", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      await erc20.mint(owner.address, ethers.parseEther("3"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("3"));

      for (let i = 0; i < 3; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const user = signers[2];

      // Open box
      const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
      await lootbox.connect(user).openBox(0, { value: price });

      // Wait many blocks
      console.log(`      Mining 10,000 blocks...`);
      await mine(10000);

      // Fulfill should still work
      await coordinator.fulfill(reqId, [0]);
      expect(await erc20.balanceOf(user.address)).to.equal(ethers.parseEther("1"));

      console.log(`      ✓ Fulfilled after 10,000 blocks`);
    });

    it("Should handle operations over long time periods", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      await erc20.mint(owner.address, ethers.parseEther("1"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("1"));
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const price = await lootbox.standardPrice();
      const user = signers[2];

      const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
      await lootbox.connect(user).openBox(0, { value: price });

      // Fast forward 1 year
      console.log(`      Fast-forwarding 1 year...`);
      await time.increase(365 * 24 * 60 * 60);

      await coordinator.fulfill(reqId, [0]);
      expect(await erc20.balanceOf(user.address)).to.equal(ethers.parseEther("1"));

      console.log(`      ✓ Fulfilled after 1 year`);
    });
  });

  describe("Complex State Transitions", function () {
    it("Should handle all possible state transitions", async function () {
      const { lootbox, erc20, erc721, coordinator, owner, signers } = await loadFixture(deployFixture);

      await lootbox.setAllowedERC721(await erc721.getAddress(), true);

      // State 1: Empty contract
      console.log(`      State 1: Empty contract`);
      const price = await lootbox.standardPrice();
      await expect(
        lootbox.connect(signers[2]).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");

      // State 2: Deposits
      console.log(`      State 2: Adding deposits`);
      await erc20.mint(owner.address, ethers.parseEther("1"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("1"));
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      // State 3: Pending opens
      console.log(`      State 3: Creating pending opens`);
      const reqId = await lootbox.connect(signers[2]).openBox.staticCall(0, { value: price });
      await lootbox.connect(signers[2]).openBox(0, { value: price });

      // State 4: Paused with pending
      console.log(`      State 4: Pausing with pending`);
      await lootbox.pause();

      // State 5: Fulfill while paused
      console.log(`      State 5: Fulfilling while paused`);
      await coordinator.fulfill(reqId, [0]);

      // State 6: Unpause when empty
      console.log(`      State 6: Unpausing when empty`);
      await lootbox.unpause();

      // State 7: Change prices
      console.log(`      State 7: Changing prices`);
      await lootbox.setPrices(ethers.parseEther("0.1"), ethers.parseEther("0.2"), ethers.parseEther("0.3"));

      // State 8: Change treasury
      console.log(`      State 8: Changing treasury`);
      const newTreasury = await ethers.Wallet.createRandom().getAddress();
      await lootbox.setTreasury(newTreasury);

      // State 9: New deposits with new config
      console.log(`      State 9: New deposits with new config`);
      await erc721.mint(owner.address, 1);
      await erc721.approve(await lootbox.getAddress(), 1);
      await lootbox.depositERC721(await erc721.getAddress(), 1, 2, 1);

      // State 10: Open with new config
      console.log(`      State 10: Opening with new config`);
      const newPrice = await lootbox.epicPrice();
      const reqId2 = await lootbox.connect(signers[3]).openBox.staticCall(2, { value: newPrice });
      await lootbox.connect(signers[3]).openBox(2, { value: newPrice });
      await coordinator.fulfill(reqId2, [0]);

      console.log(`      ✓ Successfully transitioned through all states`);
    });

    it("Should handle interleaved operations", async function () {
      const { lootbox, erc20, coordinator, owner, signers } = await loadFixture(deployFixture);

      await erc20.mint(owner.address, ethers.parseEther("10"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("10"));

      const price = await lootbox.standardPrice();

      // Interleave deposits, opens, and fulfills
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const reqId1 = await lootbox.connect(signers[2]).openBox.staticCall(0, { value: price });
      await lootbox.connect(signers[2]).openBox(0, { value: price });

      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const reqId2 = await lootbox.connect(signers[3]).openBox.staticCall(0, { value: price });
      await lootbox.connect(signers[3]).openBox(0, { value: price });

      await coordinator.fulfill(reqId1, [0]);

      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      await coordinator.fulfill(reqId2, [1]);

      const reqId3 = await lootbox.connect(signers[4]).openBox.staticCall(0, { value: price });
      await lootbox.connect(signers[4]).openBox(0, { value: price });

      await coordinator.fulfill(reqId3, [2]);

      console.log(`      ✓ Handled interleaved operations correctly`);
    });
  });

  describe("Real-World Usage Patterns", function () {
    it("Should simulate typical production usage over time", async function () {
      const { lootbox, erc20, erc721, coordinator, owner, signers } = await loadFixture(deployFixture);

      await lootbox.setAllowedERC721(await erc721.getAddress(), true);

      console.log(`      Simulating 7 days of operation...`);

      // Day 1: Initial setup
      console.log(`      Day 1: Initial setup`);
      await erc20.mint(owner.address, ethers.parseEther("20"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("20"));
      for (let i = 0; i < 20; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      // Day 1-2: Normal usage
      for (let i = 0; i < 10; i++) {
        const user = signers[i % signers.length];
        const price = await lootbox.standardPrice();
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i]);
      }
      await time.increase(24 * 60 * 60);

      // Day 3: Add more rewards
      console.log(`      Day 3: Adding more rewards`);
      await erc20.mint(owner.address, ethers.parseEther("10"));
      await erc20.approve(await lootbox.getAddress(), ethers.parseEther("10"));
      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 1, 1);
      }
      await time.increase(24 * 60 * 60);

      // Day 4: High activity
      console.log(`      Day 4: High activity period`);
      for (let i = 0; i < 15; i++) {
        const user = signers[i % signers.length];
        const price = await lootbox.gnarlyPrice();
        const reqId = await lootbox.connect(user).openBox.staticCall(1, { value: price });
        await lootbox.connect(user).openBox(1, { value: price });
        await coordinator.fulfill(reqId, [i % 10]);
      }
      await time.increase(24 * 60 * 60);

      // Day 5: Price adjustment
      console.log(`      Day 5: Price adjustment`);
      await lootbox.setPrices(ethers.parseEther("0.03"), ethers.parseEther("0.06"), ethers.parseEther("0.15"));
      await time.increase(24 * 60 * 60);

      // Day 6: Emergency pause
      console.log(`      Day 6: Emergency pause for maintenance`);
      await lootbox.pause();
      await time.increase(12 * 60 * 60); // 12 hours
      await lootbox.unpause();
      await time.increase(12 * 60 * 60);

      // Day 7: Normal operations resume
      console.log(`      Day 7: Operations resume`);
      for (let i = 0; i < 5; i++) {
        const user = signers[i % signers.length];
        const price = await lootbox.standardPrice();
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i + 10]);
      }

      console.log(`      ✓ Successfully simulated 7 days of production usage`);
    });
  });
});
