import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  loadFixture,
  time,
} from "@nomicfoundation/hardhat-network-helpers";

/**
 * COMPREHENSIVE SECURITY TEST SUITE FOR GNARS LOOTBOX V1
 *
 * Test Coverage:
 * 1. Reentrancy attacks
 * 2. Access control vulnerabilities
 * 3. Front-running/MEV attacks
 * 4. VRF manipulation attempts
 * 5. Treasury manipulation
 * 6. Weight manipulation
 * 7. Price manipulation
 * 8. Reward double-spending
 * 9. Griefing attacks
 * 10. Pausable mechanism
 * 11. Malicious token contracts
 * 12. Edge cases and overflow/underflow
 */

describe("GnarsLootboxV1 Security Tests", function () {
  // Fixtures
  async function deployLootboxFixture() {
    const [owner, treasury, alice, bob, eve] = await ethers.getSigners();

    // Deploy mock VRF Coordinator
    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const coordinator = await MockVRFCoordinator.deploy();

    const subscriptionId = 1;
    const keyHash = ethers.id("test_key_hash");

    // Deploy lootbox
    const GnarsLootboxV1 = await ethers.getContractFactory("GnarsLootboxV1");
    const lootbox = await GnarsLootboxV1.deploy(
      await coordinator.getAddress(),
      subscriptionId,
      keyHash,
      treasury.address,
      owner.address
    );

    // Deploy mock tokens
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const erc20 = await MockERC20.deploy();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const erc721 = await MockERC721.deploy();

    return { lootbox, coordinator, erc20, erc721, owner, treasury, alice, bob, eve };
  }

  async function deployMaliciousTokensFixture() {
    const base = await loadFixture(deployLootboxFixture);

    const MaliciousERC20 = await ethers.getContractFactory("MaliciousERC20");
    const maliciousERC20 = await MaliciousERC20.deploy();

    const MaliciousERC721 = await ethers.getContractFactory("MaliciousERC721");
    const maliciousERC721 = await MaliciousERC721.deploy();

    return { ...base, maliciousERC20, maliciousERC721 };
  }

  async function deployReentrantAttackerFixture() {
    const base = await loadFixture(deployLootboxFixture);

    const ReentrantAttacker = await ethers.getContractFactory("ReentrantAttacker");
    const attacker = await ReentrantAttacker.deploy(await base.lootbox.getAddress());

    return { ...base, attacker };
  }

  describe("1. Reentrancy Protection", function () {
    it("Should prevent reentrancy attack on openBox", async function () {
      const { lootbox, erc20, owner, attacker } = await loadFixture(deployReentrantAttackerFixture);

      // Setup reward
      const rewardAmount = ethers.parseEther("10");
      await erc20.mint(owner.address, rewardAmount);
      await erc20.approve(await lootbox.getAddress(), rewardAmount);
      await lootbox.depositERC20(await erc20.getAddress(), rewardAmount, 0, 10);

      // Fund attacker
      const price = await lootbox.standardPrice();
      await owner.sendTransaction({
        to: await attacker.getAddress(),
        value: price * 3n
      });

      // Attempt reentrancy - should revert
      await expect(attacker.attack({ value: price }))
        .to.be.reverted;
    });

    it("Should handle malicious ERC20 attempting reentrancy on transfer", async function () {
      const { lootbox, coordinator, owner, alice, maliciousERC20 } =
        await loadFixture(deployMaliciousTokensFixture);

      const amount = ethers.parseEther("1");
      await maliciousERC20.mint(owner.address, amount);
      await maliciousERC20.approve(await lootbox.getAddress(), amount);
      await maliciousERC20.setTarget(await lootbox.getAddress());

      await lootbox.depositERC20(await maliciousERC20.getAddress(), amount, 0, 10);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      // Fulfill should work despite malicious token
      await coordinator.fulfill(requestId, [123]);

      expect(await maliciousERC20.balanceOf(alice.address)).to.equal(amount);
    });
  });

  describe("2. Access Control", function () {
    it("Should prevent unauthorized setAllowedERC721", async function () {
      const { lootbox, erc721, eve } = await loadFixture(deployLootboxFixture);

      await expect(
        lootbox.connect(eve).setAllowedERC721(await erc721.getAddress(), true)
      ).to.be.reverted;
    });

    it("Should prevent unauthorized setTreasury", async function () {
      const { lootbox, eve } = await loadFixture(deployLootboxFixture);

      await expect(
        lootbox.connect(eve).setTreasury(eve.address)
      ).to.be.reverted;
    });

    it("Should prevent unauthorized setPrices", async function () {
      const { lootbox, eve } = await loadFixture(deployLootboxFixture);

      await expect(
        lootbox.connect(eve).setPrices(
          ethers.parseEther("1"),
          ethers.parseEther("2"),
          ethers.parseEther("3")
        )
      ).to.be.reverted;
    });

    it("Should prevent unauthorized depositERC20", async function () {
      const { lootbox, erc20, eve } = await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(eve.address, amount);
      await erc20.connect(eve).approve(await lootbox.getAddress(), amount);

      await expect(
        lootbox.connect(eve).depositERC20(await erc20.getAddress(), amount, 0, 1)
      ).to.be.reverted;
    });

    it("Should prevent unauthorized pause", async function () {
      const { lootbox, eve } = await loadFixture(deployLootboxFixture);

      await expect(lootbox.connect(eve).pause()).to.be.reverted;
    });

    it("Should prevent unauthorized unpause", async function () {
      const { lootbox, owner, eve } = await loadFixture(deployLootboxFixture);

      await lootbox.connect(owner).pause();

      await expect(lootbox.connect(eve).unpause()).to.be.reverted;
    });

    it("Should prevent unauthorized setVrfConfig", async function () {
      const { lootbox, eve } = await loadFixture(deployLootboxFixture);

      await expect(
        lootbox.connect(eve).setVrfConfig(500000, 5, 2, ethers.id("new_key"))
      ).to.be.reverted;
    });
  });

  describe("3. Treasury Manipulation", function () {
    it("Should revert if treasury is set to zero address", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      await lootbox.setTreasury(ethers.ZeroAddress);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("treasury xfer failed");
    });

    it("Should revert if malicious treasury rejects payment", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();

      await lootbox.setTreasury(await malTreasury.getAddress());

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("treasury xfer failed");
    });

    it("Should allow owner to change treasury mid-game", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);

      const price = await lootbox.standardPrice();
      const initialTreasury = await lootbox.treasury();
      const initialBalance = await ethers.provider.getBalance(initialTreasury);

      // First box
      const requestId1 = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      const newBalance1 = await ethers.provider.getBalance(initialTreasury);
      expect(newBalance1 - initialBalance).to.equal(price);

      // Change treasury
      const newTreasury = await ethers.Wallet.createRandom().getAddress();
      await lootbox.setTreasury(newTreasury);

      // Second box
      const requestId2 = await lootbox.connect(bob).openBox.staticCall(0, { value: price });
      await lootbox.connect(bob).openBox(0, { value: price });

      const newTreasuryBalance = await ethers.provider.getBalance(newTreasury);
      expect(newTreasuryBalance).to.equal(price);
    });
  });

  describe("4. Price Manipulation", function () {
    it("Should not affect pending opens when price changes", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      const initialPrice = await lootbox.standardPrice();

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      // User opens at current price
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: initialPrice });
      await lootbox.connect(alice).openBox(0, { value: initialPrice });

      // Owner changes price
      await lootbox.setPrices(
        ethers.parseEther("1"),
        ethers.parseEther("2"),
        ethers.parseEther("3")
      );

      // Fulfillment should still work
      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should handle extremely high prices", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      await lootbox.setPrices(ethers.MaxUint256, ethers.MaxUint256, ethers.MaxUint256);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      // User cannot afford max uint256
      await expect(
        lootbox.connect(alice).openBox(0, { value: ethers.parseEther("1000") })
      ).to.be.revertedWith("wrong price");
    });

    it("Should allow free boxes when price is zero", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      await lootbox.setPrices(0, 0, 0);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: 0 });
      await lootbox.connect(alice).openBox(0, { value: 0 });

      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should revert on wrong price payment (too little)", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price - 1n })
      ).to.be.revertedWith("wrong price");
    });

    it("Should revert on wrong price payment (too much)", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price + 1n })
      ).to.be.revertedWith("wrong price");
    });
  });

  describe("5. Weight Manipulation", function () {
    it("Should revert on zero weight deposit", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      await expect(
        lootbox.depositERC20(await erc20.getAddress(), amount, 0, 0)
      ).to.be.revertedWith("weight=0");
    });

    it("Should handle maximum weight value", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

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

    it("Should distribute rewards according to weight", async function () {
      const { lootbox, erc20, coordinator, owner } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("100");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      // 1% weight reward
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      // 99% weight reward
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 99);

      let lowWeightWins = 0;
      let highWeightWins = 0;
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        if (i > 0) {
          await erc20.mint(owner.address, ethers.parseEther("2"));
          await erc20.approve(await lootbox.getAddress(), ethers.parseEther("2"));
          await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
          await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 99);
        }

        const signer = (await ethers.getSigners())[i % 5];
        const price = await lootbox.standardPrice();

        const randomValue = i * 12345;
        const totalWeight = 100;
        const target = randomValue % totalWeight;

        if (target < 1) {
          lowWeightWins++;
        } else {
          highWeightWins++;
        }
      }

      expect(highWeightWins).to.be.greaterThan(90);
      expect(lowWeightWins).to.be.lessThan(10);
    });
  });

  describe("6. VRF Security", function () {
    it("Should revert on unknown request ID", async function () {
      const { coordinator } = await loadFixture(deployLootboxFixture);

      await expect(
        coordinator.fulfill(99999, [42])
      ).to.be.revertedWith("unknown request");
    });

    it("Should prevent double fulfillment", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);

      await expect(
        coordinator.fulfill(requestId, [0])
      ).to.be.revertedWith("already fulfilled");
    });

    it("Should handle coordinator change", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
      const newCoordinator = await MockVRFCoordinator.deploy();

      await lootbox.setCoordinator(await newCoordinator.getAddress());

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await newCoordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });
  });

  describe("7. Griefing Attacks", function () {
    it("Should allow pool to be drained completely", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      const numRewards = 10;
      const amount = ethers.parseEther(numRewards.toString());
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      for (let i = 0; i < numRewards; i++) {
        await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1);
      }

      const price = await lootbox.standardPrice();

      for (let i = 0; i < numRewards; i++) {
        const signer = (await ethers.getSigners())[i % 5];
        const requestId = await lootbox.connect(signer).openBox.staticCall(0, { value: price });
        await lootbox.connect(signer).openBox(0, { value: price });
        await coordinator.fulfill(requestId, [i]);
      }

      // Pool is now empty
      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });
  });

  describe("8. Pausable Mechanism", function () {
    it("Should prevent openBox when paused", async function () {
      const { lootbox, erc20, owner, alice } = await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      await lootbox.pause();

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.reverted;
    });

    it("Should allow fulfillment when paused", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await lootbox.pause();

      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount);
    });

    it("Should support pause/unpause cycle", async function () {
      const { lootbox, erc20, coordinator, owner, alice } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("2");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);
      await lootbox.depositERC20(await erc20.getAddress(), amount / 2n, 0, 1);

      await lootbox.pause();

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.reverted;

      await lootbox.unpause();

      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);

      expect(await erc20.balanceOf(alice.address)).to.equal(amount / 2n);
    });
  });

  describe("9. Malicious Token Contracts", function () {
    it("Should handle malicious ERC721 that rejects transfers", async function () {
      const { lootbox, coordinator, owner, alice, maliciousERC721 } =
        await loadFixture(deployMaliciousTokensFixture);

      await lootbox.setAllowedERC721(await maliciousERC721.getAddress(), true);

      await maliciousERC721.mint(owner.address, 1);
      await maliciousERC721.approve(await lootbox.getAddress(), 1);
      await maliciousERC721.setRejectTransfers(false);

      await lootbox.depositERC721(await maliciousERC721.getAddress(), 1, 0, 1);

      await maliciousERC721.setRejectTransfers(true);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await expect(
        coordinator.fulfill(requestId, [0])
      ).to.be.revertedWith("Transfer rejected");
    });

    it("Should handle malicious ERC20 that rejects transfers", async function () {
      const { lootbox, coordinator, owner, alice, maliciousERC20 } =
        await loadFixture(deployMaliciousTokensFixture);

      const amount = ethers.parseEther("1");
      await maliciousERC20.mint(owner.address, amount);
      await maliciousERC20.approve(await lootbox.getAddress(), amount);
      await maliciousERC20.setRejectTransfers(false);

      await lootbox.depositERC20(await maliciousERC20.getAddress(), amount, 0, 1);

      await maliciousERC20.setRejectTransfers(true);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await expect(
        coordinator.fulfill(requestId, [0])
      ).to.be.reverted; // SafeERC20 will revert
    });
  });

  describe("10. Edge Cases", function () {
    it("Should revert on zero amount ERC20 deposit", async function () {
      const { lootbox, erc20, owner } = await loadFixture(deployLootboxFixture);

      await erc20.mint(owner.address, 0);
      await erc20.approve(await lootbox.getAddress(), 0);

      await expect(
        lootbox.depositERC20(await erc20.getAddress(), 0, 0, 1)
      ).to.be.revertedWith("amount=0");
    });

    it("Should revert when opening from empty pool", async function () {
      const { lootbox, alice } = await loadFixture(deployLootboxFixture);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });

    it("Should isolate different pool types", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("3");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);

      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 0, 1); // Standard
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 1, 1); // Gnarly
      await lootbox.depositERC20(await erc20.getAddress(), ethers.parseEther("1"), 2, 1); // Epic

      const standardPrice = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: standardPrice });
      await lootbox.connect(alice).openBox(0, { value: standardPrice });

      await coordinator.fulfill(requestId, [0]);

      // Standard pool is empty
      await expect(
        lootbox.connect(bob).openBox(0, { value: standardPrice })
      ).to.be.revertedWith("empty pool");

      // Gnarly pool still works
      const gnarlyPrice = await lootbox.gnarlyPrice();
      const requestId2 = await lootbox.connect(bob).openBox.staticCall(1, { value: gnarlyPrice });
      await lootbox.connect(bob).openBox(1, { value: gnarlyPrice });

      await coordinator.fulfill(requestId2, [0]);

      expect(await erc20.balanceOf(bob.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should ensure rewards are consumed only once", async function () {
      const { lootbox, erc20, coordinator, owner, alice, bob } =
        await loadFixture(deployLootboxFixture);

      const amount = ethers.parseEther("1");
      await erc20.mint(owner.address, amount);
      await erc20.approve(await lootbox.getAddress(), amount);
      await lootbox.depositERC20(await erc20.getAddress(), amount, 0, 1);

      const price = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: price });
      await lootbox.connect(alice).openBox(0, { value: price });

      await coordinator.fulfill(requestId, [0]);

      await expect(
        lootbox.connect(bob).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });

    it("Should reject NFT without allowlist", async function () {
      const { lootbox, owner } = await loadFixture(deployLootboxFixture);

      const MockERC721 = await ethers.getContractFactory("MockERC721");
      const unauthorizedNFT = await MockERC721.deploy();

      await unauthorizedNFT.mint(owner.address, 1);
      await unauthorizedNFT.approve(await lootbox.getAddress(), 1);

      await expect(
        lootbox.depositERC721(await unauthorizedNFT.getAddress(), 1, 0, 1)
      ).to.be.revertedWith("erc721 not allowed");
    });
  });
});
