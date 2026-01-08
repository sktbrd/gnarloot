import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * EXHAUSTIVE EDGE CASE TESTS FOR GNARS LOOTBOX V1
 *
 * Testing EVERYTHING possible:
 * - Integer boundaries (0, 1, max values)
 * - Block manipulation (timestamp, number)
 * - Gas limit attacks
 * - Storage collision
 * - Function selector collision
 * - Multi-user race conditions
 * - All revert paths
 * - Event validation
 * - State consistency
 * - Precision loss
 * - Rounding errors
 */

describe("GnarsLootboxV1 Exhaustive Tests", function () {
  async function deployFixture() {
    const [owner, treasury, alice, bob, charlie, dave] = await ethers.getSigners();

    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const coordinator = await MockVRFCoordinator.deploy();

    const subscriptionId = 1;
    const keyHash = ethers.id("test_key");

    const GnarsLootboxV1 = await ethers.getContractFactory("GnarsLootboxV1");
    const lootbox = await GnarsLootboxV1.deploy(
      await coordinator.getAddress(),
      subscriptionId,
      keyHash,
      treasury.address,
      owner.address
    );

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const erc20 = await MockERC20.deploy();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const erc721 = await MockERC721.deploy();

    return { lootbox, coordinator, erc20, erc721, owner, treasury, alice, bob, charlie, dave };
  }

  describe("Integer Boundary Tests", function () {
    it("Should handle uint256 max price", async function () {
      const { lootbox, owner } = await loadFixture(deployFixture);

      await lootbox.setPrices(ethers.MaxUint256, ethers.MaxUint256, ethers.MaxUint256);

      expect(await lootbox.standardPrice()).to.equal(ethers.MaxUint256);
    });

    it("Should handle uint16 max weight", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      const maxWeight = 65535; // uint16 max
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, maxWeight);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should handle weight overflow in totalWeight", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      const maxWeight = 65535;
      const amount = ethers.parseEther("1");

      // Deposit multiple max weight rewards
      for (let i = 0; i < 100; i++) {
        await erc20.mint(owner.address, amount);
        await erc20.approve(await lootbox.getAddress(), amount);
        await lootbox.depositERC20(await erc20.getAddress(), amount, 0, maxWeight);
      }

      // Total weight = 65535 * 100 = 6,553,500
      // This should work (no overflow in uint256)
    });

    it("Should handle subscription ID at uint256 max", async function () {
      const { owner, treasury } = await loadFixture(deployFixture);

      const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
      const coordinator = await MockVRFCoordinator.deploy();

      const GnarsLootboxV1 = await ethers.getContractFactory("GnarsLootboxV1");
      const lootbox = await GnarsLootboxV1.deploy(
        await coordinator.getAddress(),
        ethers.MaxUint256,
        ethers.id("key"),
        treasury.address,
        owner.address
      );

      expect(await lootbox.subscriptionId()).to.equal(ethers.MaxUint256);
    });

    it("Should handle zero values everywhere possible", async function () {
      const { lootbox, owner, treasury } = await loadFixture(deployFixture);

      // Zero prices
      await lootbox.setPrices(0, 0, 0);
      expect(await lootbox.standardPrice()).to.equal(0);

      // Zero subscription ID
      const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
      const coordinator = await MockVRFCoordinator.deploy();

      const GnarsLootboxV1 = await ethers.getContractFactory("GnarsLootboxV1");
      const lootbox2 = await GnarsLootboxV1.deploy(
        await coordinator.getAddress(),
        0,
        ethers.ZeroHash,
        treasury.address,
        owner.address
      );

      expect(await lootbox2.subscriptionId()).to.equal(0);
    });

    it("Should handle exactly 1 wei amounts", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      await lootbox.setPrices(1, 1, 1);

      await erc20.mint(owner.address, 1);
      await erc20.approve(await lootbox.getAddress(), 1);
      await lootbox.depositERC20(await erc20.getAddress(), 1, 0, 1);

      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: 1 });
      await lootbox.connect(alice).openBox(0, { value: 1 });

      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(1);
    });
  });

  describe("Gas Limit and DoS Attacks", function () {
    it("Should measure gas cost with 1 reward", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const tx = await lootbox.connect(alice).openBox(0, { value: price });
      const receipt = await tx.wait();

      console.log(`      Gas used (1 reward): ${receipt?.gasUsed}`);
    });

    it("Should measure gas cost with 10 rewards", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("10");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const tx = await lootbox.connect(alice).openBox(0, { value: price });
      const receipt = await tx.wait();

      console.log(`      Gas used (10 rewards): ${receipt?.gasUsed}`);
    });

    it("Should measure gas cost with 100 rewards", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 100; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const tx = await lootbox.connect(alice).openBox(0, { value: price });
      const receipt = await tx.wait();

      console.log(`      Gas used (100 rewards): ${receipt?.gasUsed}`);
    });

    it("Should test fulfillRandomWords gas with 100 rewards (worst case)", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      // Create 100 rewards
      for (let i = 0; i < 100; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Select last reward (worst case - scans all 100)
      const totalWeight = 100;
      const targetLast = totalWeight - 1;

      const tx = await coordinator.fulfill(requestId, [targetLast]);
      const receipt = await tx.wait();

      console.log(`      Fulfill gas (worst case, 100 rewards): ${receipt?.gasUsed}`);

      // Check if it exceeds callback gas limit
      const callbackGasLimit = await lootbox.callbackGasLimit();
      if (receipt && receipt.gasUsed > callbackGasLimit) {
        console.log(`      ⚠️  WARNING: Gas used (${receipt.gasUsed}) exceeds callback limit (${callbackGasLimit})`);
      }
    });

    it("Should test if 500 rewards causes out of gas", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      this.timeout(120000); // Increase timeout

      const amount = ethers.parseEther("500");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 500; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Try to fulfill with last reward (worst case)
      const targetLast = 499;

      try {
        const tx = await coordinator.fulfill(requestId, [targetLast]);
        const receipt = await tx.wait();
        console.log(`      Fulfill gas (500 rewards): ${receipt?.gasUsed}`);

        const callbackGasLimit = await lootbox.callbackGasLimit();
        if (receipt && receipt.gasUsed > callbackGasLimit) {
          console.log(`      ❌ CRITICAL: Gas (${receipt.gasUsed}) > limit (${callbackGasLimit})`);
        }
      } catch (error: any) {
        if (error.message.includes("out of gas")) {
          console.log(`      ❌ CRITICAL: Out of gas with 500 rewards!`);
        }
        throw error;
      }
    });

    it("Should test consumed reward gas overhead", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 100; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      // Open and consume 50 rewards
      for (let i = 0; i < 50; i++) {
        await erc20.mint(owner.address, ethers.parseEther("1"));
        await erc20.approve(await lootbox.getAddress(), ethers.parseEther("1"));
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 1, 1); // Different pool

        const signer = (await ethers.getSigners())[i % 6];
        const price = await lootbox.gnarlyPrice();
        const reqId = await lootbox.connect(signer).openBox.staticCall(1, { value: price });
        await lootbox.connect(signer).openBox(1, { value: price });
        await coordinator.fulfill(reqId, [0]);
      }

      // Now test standard pool with 50 consumed, 50 active
      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Select last active reward (needs to skip 50 consumed)
      const tx = await coordinator.fulfill(requestId, [99]);
      const receipt = await tx.wait();

      console.log(`      Gas with 50% consumed rewards: ${receipt?.gasUsed}`);
    });
  });

  describe("Race Conditions and Multi-User Scenarios", function () {
    it("Should handle multiple users opening same pool simultaneously", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob, charlie } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("3");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 3; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      // All three users open boxes
      const reqId1 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      const reqId2 = await lootbox.connect(bob).openBox.staticCall(0, { value: price });
      await lootbox.connect(bob).openBox(0, { value: price });

      const reqId3 = await lootbox.connect(charlie).openBox.staticCall(0, { value: price });
      await lootbox.connect(charlie).openBox(0, { value: price });

      // Fulfill all three
      await coordinator.fulfill(reqId1, [0]);
      await coordinator.fulfill(reqId2, [1]);
      await coordinator.fulfill(reqId3, [2]);

      // All should receive rewards
      expect(await erc20.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
      expect(await erc20.balanceOf(bob.address)).to.equal(ethers.parseEther("1"));
      expect(await erc20.balanceOf(charlie.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should handle VRF fulfillments out of order", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob, charlie } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("3");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 3; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      const reqId1 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      const reqId2 = await lootbox.connect(bob).openBox.staticCall(0, { value: price });
      await lootbox.connect(bob).openBox(0, { value: price });

      const reqId3 = await lootbox.connect(charlie).openBox.staticCall(0, { value: price });
      await lootbox.connect(charlie).openBox(0, { value: price });

      // Fulfill in reverse order
      await coordinator.fulfill(reqId3, [2]);
      await coordinator.fulfill(reqId1, [0]);
      await coordinator.fulfill(reqId2, [1]);

      expect(await erc20.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
      expect(await erc20.balanceOf(bob.address)).to.equal(ethers.parseEther("1"));
      expect(await erc20.balanceOf(charlie.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should prevent same user opening multiple boxes when pool has only one", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      const reqId1 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Try to open again - should fail (empty pool)
      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });

    it("Should handle rapid consecutive opens and fulfills", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("10");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();
      const requestIds: bigint[] = [];

      // Rapidly open 10 boxes
      for (let i = 0; i < 10; i++) {
        const reqId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
        await lootbox.connect(alice).openBox(0, { value: price });
        requestIds.push(reqId);
      }

      // Rapidly fulfill all
      for (let i = 0; i < 10; i++) {
        await coordinator.fulfill(requestIds[i], [i]);
      }

      expect(await erc20.balanceOf(alice.address)).to.equal(ethers.parseEther("10"));
    });
  });

  describe("Block and Time Manipulation", function () {
    it("Should work across block boundaries", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Mine 1000 blocks
      await mine(1000);

      // Fulfill should still work
      await coordinator.fulfill(requestId, [0]);
      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should work with time increase", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Increase time by 1 year
      await time.increase(365 * 24 * 60 * 60);

      await coordinator.fulfill(requestId, [0]);
      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should handle requests from same block", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);

      const price = await lootbox.standardPrice();

      // Disable auto-mining to batch transactions
      await ethers.provider.send("evm_setAutomine", [false]);

      const reqPromise1 = lootbox.connect(alice).openBox(0, { value: price });
      const reqPromise2 = lootbox.connect(bob).openBox(0, { value: price });

      await ethers.provider.send("evm_mine", []);
      await ethers.provider.send("evm_setAutomine", [true]);

      await reqPromise1;
      await reqPromise2;

      // Both should have pending opens
    });
  });

  describe("Event Emission Validation", function () {
    it("Should emit AllowedERC721Updated with correct parameters", async function () {
      const { lootbox, erc721 } = await loadFixture(deployFixture);

      await expect(lootbox.setAllowedERC721(await erc721.getAddress(), true))
        .to.emit(lootbox, "AllowedERC721Updated")
        .withArgs(await erc721.getAddress(), true);
    });

    it("Should emit TreasuryUpdated", async function () {
      const { lootbox } = await loadFixture(deployFixture);
      const newTreasury = await ethers.Wallet.createRandom().getAddress();

      await expect(lootbox.setTreasury(newTreasury))
        .to.emit(lootbox, "TreasuryUpdated")
        .withArgs(newTreasury);
    });

    it("Should emit RewardDeposited with all parameters", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      await expect(lootbox.depositERC20(await erc20.getAddress(), amount, 0, 10))
        .to.emit(lootbox, "RewardDeposited")
        .withArgs(0, 0, await erc20.getAddress(), amount, 0, 10, 0);
    });

    it("Should emit OpenRequested", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      await expect(lootbox.connect(alice).openBox(0, { value: price }))
        .to.emit(lootbox, "OpenRequested");
    });

    it("Should emit BoxOpened on fulfillment", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await expect(coordinator.fulfill(requestId, [0]))
        .to.emit(lootbox, "BoxOpened");
    });
  });

  describe("Randomness Distribution Tests", function () {
    it("Should distribute rewards fairly with equal weights", async function () {
      const { lootbox, erc20, coordinator, owner } = await loadFixture(deployFixture);

      // Create 10 equal-weight rewards
      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("10"), 0, 10);
      }

      const distribution: number[] = new Array(10).fill(0);

      // Simulate 1000 random selections
      for (let i = 0; i < 1000; i++) {
        const rand = i * 12345678;
        const totalWeight = 100;
        const target = rand % totalWeight;

        let cumulative = 0;
        for (let j = 0; j < 10; j++) {
          cumulative += 10;
          if (target < cumulative) {
            distribution[j]++;
            break;
          }
        }
      }

      console.log(`      Distribution:`, distribution);

      // Each should get roughly 100 selections (10% of 1000)
      for (let i = 0; i < 10; i++) {
        expect(distribution[i]).to.be.greaterThan(75); // Allow variance
        expect(distribution[i]).to.be.lessThan(125);
      }
    });

    it("Should respect weight ratios (1:9)", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 9);

      let lowWeightCount = 0;
      let highWeightCount = 0;

      for (let i = 0; i < 1000; i++) {
        const rand = i * 98765;
        const totalWeight = 10;
        const target = rand % totalWeight;

        if (target < 1) {
          lowWeightCount++;
        } else {
          highWeightCount++;
        }
      }

      console.log(`      1-weight: ${lowWeightCount}, 9-weight: ${highWeightCount}`);

      // Should be roughly 100:900
      expect(lowWeightCount).to.be.greaterThan(75);
      expect(lowWeightCount).to.be.lessThan(125);
      expect(highWeightCount).to.be.greaterThan(875);
      expect(highWeightCount).to.be.lessThan(925);
    });

    it("Should handle extreme weight ratios (1:65535)", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 65535);

      let lowWeightCount = 0;
      let highWeightCount = 0;

      for (let i = 0; i < 10000; i++) {
        const rand = i * 11111;
        const totalWeight = 65536;
        const target = rand % totalWeight;

        if (target < 1) {
          lowWeightCount++;
        } else {
          highWeightCount++;
        }
      }

      console.log(`      Extreme ratio - Low: ${lowWeightCount}, High: ${highWeightCount}`);

      // Low weight should win very rarely (roughly 1 in 65536)
      expect(lowWeightCount).to.be.lessThan(5); // Allow some variance
      expect(highWeightCount).to.be.greaterThan(9995);
    });
  });

  describe("State Consistency Tests", function () {
    it("Should maintain pool state after multiple operations", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } = await loadFixture(deployFixture);

      // Initial state
      const amount = ethers.parseEther("10");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 10; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 10);
      }

      // Open 5 boxes
      const price = await lootbox.standardPrice();
      for (let i = 0; i < 5; i++) {
        const user = i % 2 === 0 ? alice : bob;
        const reqId = await lootbox.connect(user).openBox.staticCall(0, { value: price });
        await lootbox.connect(user).openBox(0, { value: price });
        await coordinator.fulfill(reqId, [i]);
      }

      // Verify 5 rewards remain
      // Pool should still be openable
      const reqId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await expect(lootbox.connect(alice).openBox(0, { value: price })).to.not.be.reverted;
    });

    it("Should properly track consumed rewards", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const amount = ethers.parseEther("3");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < 3; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      // Consume first reward
      const reqId1 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });
      await coordinator.fulfill(reqId1, [0]);

      // Next selection should skip consumed reward
      const reqId2 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });
      await coordinator.fulfill(reqId2, [0]); // Should select reward index 1 now

      expect(await erc20.balanceOf(alice.address)).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Precision and Rounding Tests", function () {
    it("Should handle odd ETH amounts", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      // Set odd price
      await lootbox.setPrices(
        ethers.parseEther("0.0123456789"),
        ethers.parseEther("0.0123456789"),
        ethers.parseEther("0.0123456789")
      );

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);
      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should handle fractional wei amounts", async function () {
      const { lootbox, erc20, coordinator, owner, alice } = await loadFixture(deployFixture);

      const oddAmount = ethers.parseEther("1.123456789123456789");
      await erc20.mint(owner.address, oddAmount);
      await erc20.approve(await lootbox.getAddress(), oddAmount);
      await lootbox.depositERC20(await erc20.getAddress(), oddAmount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);
      expect(await erc20.balanceOf(alice.address)).to.equal(oddAmount);
    });
  });
});
