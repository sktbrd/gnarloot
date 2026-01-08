import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

/**
 * COMPREHENSIVE SECURITY TEST SUITE FOR GNARS LOOTBOX V2
 *
 * Additional V2-specific security concerns:
 * 1. Flex box accounting attacks
 * 2. GNARS reservation manipulation
 * 3. NFT reservation attacks
 * 4. Bundle validation bypasses
 * 5. Reserved token accounting errors
 * 6. Flex payout calculation exploits
 * 7. Cancel/retry attack vectors
 * 8. Bundle vs flex pool isolation
 */

describe("GnarsLootboxV2 Security Tests", function () {
  async function deployLootboxV2Fixture() {
    const [owner, treasury, alice, bob, eve] = await ethers.getSigners();

    const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
    const coordinator = await MockVRFCoordinator.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const gnarsToken = await MockERC20.deploy();

    const subscriptionId = 1;
    const keyHash = ethers.id("test_key_hash");
    const gnarsUnit = ethers.parseEther("1");

    const GnarsLootboxV2 = await ethers.getContractFactory("GnarsLootboxV2");
    const lootbox = await GnarsLootboxV2.deploy(
      await coordinator.getAddress(),
      subscriptionId,
      keyHash,
      treasury.address,
      owner.address,
      await gnarsToken.getAddress(),
      gnarsUnit
    );

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const nft1 = await MockERC721.deploy();
    const nft2 = await MockERC721.deploy();

    return { lootbox, coordinator, gnarsToken, nft1, nft2, owner, treasury, alice, bob, eve, gnarsUnit };
  }

  describe("1. Bundle Deposit Security", function () {
    it("Should enforce GNARS amount restrictions", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      // Invalid amount (not 1000, 5000, 10000, or 100000)
      const invalidAmount = gnarsUnit * 1500n;
      await gnarsToken.mint(owner.address, invalidAmount);
      await gnarsToken.approve(await lootbox.getAddress(), invalidAmount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await expect(
        lootbox.depositBundle([await nft1.getAddress()], [1], invalidAmount, 0, 10)
      ).to.be.revertedWith("bad gnars amount");
    });

    it("Should accept valid GNARS amounts", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const validAmounts = [1000n, 5000n, 10000n, 100000n];

      for (const multiplier of validAmounts) {
        const amount = gnarsUnit * multiplier;
        await gnarsToken.mint(owner.address, amount);
        await gnarsToken.approve(await lootbox.getAddress(), amount);

        const tokenId = Number(multiplier);
        await nft1.mint(owner.address, tokenId);
        await nft1.approve(await lootbox.getAddress(), tokenId);

        await expect(
          lootbox.depositBundle([await nft1.getAddress()], [tokenId], amount, 0, 10)
        ).to.not.be.reverted;
      }
    });

    it("Should prevent bundle deposit to Flex pool", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const amount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, amount);
      await gnarsToken.approve(await lootbox.getAddress(), amount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await expect(
        lootbox.depositBundle([await nft1.getAddress()], [1], amount, 3, 10) // BoxType.Flex = 3
      ).to.be.revertedWith("flex uses own pool");
    });

    it("Should enforce NFT count limits (1-3)", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const amount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, amount);
      await gnarsToken.approve(await lootbox.getAddress(), amount);

      // Zero NFTs
      await expect(
        lootbox.depositBundle([], [], amount, 0, 10)
      ).to.be.revertedWith("nft count");

      // Four NFTs
      await nft1.mint(owner.address, 1);
      await nft1.mint(owner.address, 2);
      await nft1.mint(owner.address, 3);
      await nft1.mint(owner.address, 4);

      await nft1.approve(await lootbox.getAddress(), 1);
      await nft1.approve(await lootbox.getAddress(), 2);
      await nft1.approve(await lootbox.getAddress(), 3);
      await nft1.approve(await lootbox.getAddress(), 4);

      await expect(
        lootbox.depositBundle(
          [await nft1.getAddress(), await nft1.getAddress(), await nft1.getAddress(), await nft1.getAddress()],
          [1, 2, 3, 4],
          amount,
          0,
          10
        )
      ).to.be.revertedWith("nft count");
    });

    it("Should require matching array lengths", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const amount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, amount);
      await gnarsToken.approve(await lootbox.getAddress(), amount);

      await expect(
        lootbox.depositBundle([await nft1.getAddress()], [1, 2], amount, 0, 10)
      ).to.be.revertedWith("length mismatch");
    });

    it("Should enforce zero weight check", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const amount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, amount);
      await gnarsToken.approve(await lootbox.getAddress(), amount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await expect(
        lootbox.depositBundle([await nft1.getAddress()], [1], amount, 0, 0)
      ).to.be.revertedWith("weight=0");
    });
  });

  describe("2. GNARS Reservation Accounting", function () {
    it("Should correctly track reserved GNARS", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const amount1 = gnarsUnit * 1000n;
      const amount2 = gnarsUnit * 5000n;

      await gnarsToken.mint(owner.address, amount1 + amount2);
      await gnarsToken.approve(await lootbox.getAddress(), amount1 + amount2);

      await nft1.mint(owner.address, 1);
      await nft1.mint(owner.address, 2);
      await nft1.approve(await lootbox.getAddress(), 1);
      await nft1.approve(await lootbox.getAddress(), 2);

      await lootbox.depositBundle([await nft1.getAddress()], [1], amount1, 0, 10);
      expect(await lootbox.totalReservedGnars()).to.equal(amount1);

      await lootbox.depositBundle([await nft1.getAddress()], [2], amount2, 0, 10);
      expect(await lootbox.totalReservedGnars()).to.equal(amount1 + amount2);
    });

    it("Should prevent flex box if insufficient available GNARS", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      // Deposit bundle that reserves all GNARS
      const bundleAmount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, bundleAmount);
      await gnarsToken.approve(await lootbox.getAddress(), bundleAmount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await lootbox.depositBundle([await nft1.getAddress()], [1], bundleAmount, 0, 10);

      // Try to open flex box with no available GNARS (all reserved for bundle)
      const minFlex = await lootbox.minFlexEth();
      await expect(
        lootbox.connect(alice).openFlexBox({ value: minFlex })
      ).to.be.revertedWith("insufficient gnars");
    });

    it("Should correctly calculate available GNARS", async function () {
      const { lootbox, gnarsToken, nft1, owner, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      // Deposit 10000 GNARS for flex
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      // Reserve 5000 for bundle
      const bundleAmount = gnarsUnit * 5000n;
      await gnarsToken.mint(owner.address, bundleAmount);
      await gnarsToken.approve(await lootbox.getAddress(), bundleAmount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await lootbox.depositBundle([await nft1.getAddress()], [1], bundleAmount, 0, 10);

      const balances = await lootbox.getFlexBalances();
      expect(balances.reservedGnars).to.equal(bundleAmount);
      expect(balances.availableGnars).to.equal(flexDeposit);
    });
  });

  describe("3. Flex Box Security", function () {
    it("Should enforce minimum flex ETH", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      // Deposit GNARS for flex
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      // Deposit flex NFT
      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      const minFlex = await lootbox.minFlexEth();

      await expect(
        lootbox.connect(alice).openFlexBox({ value: minFlex - 1n })
      ).to.be.revertedWith("min flex");
    });

    it("Should revert if flex NFT pool is empty and NFT chance > 0", async function () {
      const { lootbox, gnarsToken, owner, alice, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      // Deposit GNARS but no NFTs
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      const minFlex = await lootbox.minFlexEth();

      await expect(
        lootbox.connect(alice).openFlexBox({ value: minFlex })
      ).to.be.revertedWith("flex nft empty");
    });

    it("Should allow flex box when NFT chance is 0", async function () {
      const { lootbox, gnarsToken, coordinator, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      // Set flex NFT chance to 0
      await lootbox.setFlexConfig(
        ethers.parseEther("0.0002"),
        20, // nothing BPS
        0,  // NFT BPS = 0
        gnarsUnit * 500n,
        gnarsUnit * 10000n
      );

      // Deposit GNARS only (no NFTs needed)
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      const minFlex = await lootbox.minFlexEth();
      const requestId = await lootbox.connect(alice).openFlexBox.staticCall({ value: minFlex });
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      // Should work
      await coordinator.fulfill(requestId, [5000]); // Roll above nothing threshold
    });

    it("Should correctly reserve NFT on flex box open", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      // Deposit GNARS
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      // Deposit flex NFT
      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      expect(await lootbox.flexNftReserved()).to.equal(0);

      const minFlex = await lootbox.minFlexEth();
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      expect(await lootbox.flexNftReserved()).to.equal(1);
    });

    it("Should validate flex config BPS limits", async function () {
      const { lootbox, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      // Total BPS > 10000
      await expect(
        lootbox.setFlexConfig(
          ethers.parseEther("0.0002"),
          5000,  // nothing BPS
          6000,  // NFT BPS
          gnarsUnit * 500n,
          gnarsUnit * 10000n
        )
      ).to.be.revertedWith("bad bps");
    });
  });

  describe("4. Cancel/Retry Attack Vectors", function () {
    it("Should properly release reservations on cancel", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      // Setup
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      const minFlex = await lootbox.minFlexEth();
      const requestId = await lootbox.connect(alice).openFlexBox.staticCall({ value: minFlex });
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      expect(await lootbox.flexNftReserved()).to.equal(1);
      expect(await lootbox.flexGnarsReserved()).to.be.greaterThan(0);

      // Cancel
      await lootbox.cancelOpen(requestId);

      expect(await lootbox.flexNftReserved()).to.equal(0);
      expect(await lootbox.flexGnarsReserved()).to.equal(0);
    });

    it("Should prevent cancel of already fulfilled request", async function () {
      const { lootbox, gnarsToken, nft1, coordinator, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      // Setup
      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      const minFlex = await lootbox.minFlexEth();
      const requestId = await lootbox.connect(alice).openFlexBox.staticCall({ value: minFlex });
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      // Fulfill
      await coordinator.fulfill(requestId, [5000]);

      // Try to cancel
      await expect(
        lootbox.cancelOpen(requestId)
      ).to.be.revertedWith("already fulfilled");
    });

    it("Should only allow owner to retry", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, eve, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      const minFlex = await lootbox.minFlexEth();
      const requestId = await lootbox.connect(alice).openFlexBox.staticCall({ value: minFlex });
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      await expect(
        lootbox.connect(eve).retryOpen(requestId)
      ).to.be.reverted;
    });

    it("Should preserve pending open data on retry", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);
      await lootbox.depositFlexNft(await nft1.getAddress(), 1);

      const minFlex = await lootbox.minFlexEth();
      const requestId = await lootbox.connect(alice).openFlexBox.staticCall({ value: minFlex });
      await lootbox.connect(alice).openFlexBox({ value: minFlex });

      const pendingBefore = await lootbox.pendingOpens(requestId);

      const newRequestId = await lootbox.retryOpen.staticCall(requestId);
      await lootbox.retryOpen(requestId);

      const pendingAfter = await lootbox.pendingOpens(newRequestId);

      expect(pendingAfter.user).to.equal(pendingBefore.user);
      expect(pendingAfter.boxType).to.equal(pendingBefore.boxType);
      expect(pendingAfter.paid).to.equal(pendingBefore.paid);
    });
  });

  describe("5. Reentrancy and Access Control", function () {
    it("Should prevent unauthorized access to admin functions", async function () {
      const { lootbox, nft1, eve, gnarsUnit } = await loadFixture(deployLootboxV2Fixture);

      await expect(lootbox.connect(eve).setAllowedERC721(await nft1.getAddress(), true)).to.be.reverted;
      await expect(lootbox.connect(eve).setTreasury(eve.address)).to.be.reverted;
      await expect(lootbox.connect(eve).setPrices(1, 2, 3)).to.be.reverted;
      await expect(
        lootbox.connect(eve).setFlexConfig(1, 20, 50, gnarsUnit * 500n, gnarsUnit * 10000n)
      ).to.be.reverted;
      await expect(lootbox.connect(eve).pause()).to.be.reverted;
    });

    it("Should protect openBox with reentrancy guard", async function () {
      const { lootbox, gnarsToken, nft1, coordinator, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const bundleAmount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, bundleAmount);
      await gnarsToken.approve(await lootbox.getAddress(), bundleAmount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await lootbox.depositBundle([await nft1.getAddress()], [1], bundleAmount, 0, 10);

      const price = await lootbox.standardPrice();

      // Multiple simultaneous calls should fail
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(lootbox.connect(alice).openBox(0, { value: price }));
      }

      // At least 2 should fail
      let failures = 0;
      for (const p of promises) {
        try {
          await p;
        } catch {
          failures++;
        }
      }

      expect(failures).to.be.greaterThanOrEqual(2);
    });

    it("Should protect openFlexBox with reentrancy guard", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      const flexDeposit = gnarsUnit * 100000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);
      for (let i = 0; i < 10; i++) {
        await nft1.mint(owner.address, i);
        await nft1.approve(await lootbox.getAddress(), i);
        await lootbox.depositFlexNft(await nft1.getAddress(), i);
      }

      const minFlex = await lootbox.minFlexEth();

      // Multiple simultaneous calls should fail
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(lootbox.connect(alice).openFlexBox({ value: minFlex }));
      }

      let failures = 0;
      for (const p of promises) {
        try {
          await p;
        } catch {
          failures++;
        }
      }

      expect(failures).to.be.greaterThanOrEqual(2);
    });
  });

  describe("6. Edge Cases and Overflow Protection", function () {
    it("Should prevent flex payout calculation overflow", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      // Set extremely high flex payout rates
      await lootbox.setFlexConfig(
        ethers.parseEther("0.0001"),
        20,
        0, // No NFT chance to simplify
        gnarsUnit * 1n,
        ethers.MaxUint256 / ethers.parseEther("1") // Max safe rate
      );

      // Deposit GNARS
      const flexDeposit = ethers.MaxUint256 / 2n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      // Try to open with max ETH - should not overflow
      const maxPayment = ethers.parseEther("100");

      await expect(
        lootbox.connect(alice).openFlexBox({ value: maxPayment })
      ).to.not.be.reverted;
    });

    it("Should handle empty bundle pool correctly", async function () {
      const { lootbox, alice } = await loadFixture(deployLootboxV2Fixture);

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.revertedWith("empty pool");
    });

    it("Should isolate standard/gnarly/epic pools", async function () {
      const { lootbox, gnarsToken, nft1, coordinator, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      for (let boxType = 0; boxType < 3; boxType++) {
        const bundleAmount = gnarsUnit * 1000n;
        await gnarsToken.mint(owner.address, bundleAmount);
        await gnarsToken.approve(await lootbox.getAddress(), bundleAmount);

        await nft1.mint(owner.address, boxType);
        await nft1.approve(await lootbox.getAddress(), boxType);

        await lootbox.depositBundle([await nft1.getAddress()], [boxType], bundleAmount, boxType, 10);
      }

      // Open standard
      const standardPrice = await lootbox.standardPrice();
      const requestId = await lootbox.connect(alice).openBox.staticCall(0, { value: standardPrice });
      await lootbox.connect(alice).openBox(0, { value: standardPrice });
      await coordinator.fulfill(requestId, [0]);

      // Standard is empty, others are not
      await expect(
        lootbox.connect(alice).openBox(0, { value: standardPrice })
      ).to.be.revertedWith("empty pool");

      // Gnarly still works
      const gnarlyPrice = await lootbox.gnarlyPrice();
      await expect(
        lootbox.connect(alice).openBox(1, { value: gnarlyPrice })
      ).to.not.be.reverted;
    });
  });

  describe("7. Pausable Mechanism", function () {
    it("Should block openBox when paused", async function () {
      const { lootbox, gnarsToken, nft1, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      await lootbox.setAllowedERC721(await nft1.getAddress(), true);

      const bundleAmount = gnarsUnit * 1000n;
      await gnarsToken.mint(owner.address, bundleAmount);
      await gnarsToken.approve(await lootbox.getAddress(), bundleAmount);

      await nft1.mint(owner.address, 1);
      await nft1.approve(await lootbox.getAddress(), 1);

      await lootbox.depositBundle([await nft1.getAddress()], [1], bundleAmount, 0, 10);

      await lootbox.pause();

      const price = await lootbox.standardPrice();

      await expect(
        lootbox.connect(alice).openBox(0, { value: price })
      ).to.be.reverted;
    });

    it("Should block openFlexBox when paused", async function () {
      const { lootbox, gnarsToken, owner, alice, gnarsUnit } =
        await loadFixture(deployLootboxV2Fixture);

      await lootbox.setFlexConfig(
        ethers.parseEther("0.0002"),
        20,
        0, // No NFT requirement
        gnarsUnit * 500n,
        gnarsUnit * 10000n
      );

      const flexDeposit = gnarsUnit * 10000n;
      await gnarsToken.mint(owner.address, flexDeposit);
      await gnarsToken.approve(await lootbox.getAddress(), flexDeposit);
      await lootbox.depositGnars(flexDeposit);

      await lootbox.pause();

      const minFlex = await lootbox.minFlexEth();

      await expect(
        lootbox.connect(alice).openFlexBox({ value: minFlex })
      ).to.be.reverted;
    });
  });
});
