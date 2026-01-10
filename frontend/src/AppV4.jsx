import { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import { V4_ABI } from "./v4-abi";
import "./App.css";

const DEFAULTS = {
  coordinator: "0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634",
  keyHash: "0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab",
  treasury: "0x8Bf5941d27176242745B716251943Ae4892a3C26",
  gnarsToken: "0x0cf0c3b75d522290d7d12c74d7f1f0cc47ccb23b",
  gnarsUnit: "1000000000000000000", // 1e18
};

const GNARS_NFT_ADDRESS = "0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17";
const TEST_NFT_ADDRESS = "0x6940100c44d21cd1570b394a1c42949c3eb820d";
const CUSTOM_OPTION = "custom";
const GNARS_UNIT_18 = 10n ** 18n;

const NFT_PRESETS = [
  { label: "Test NFT", address: TEST_NFT_ADDRESS },
  { label: "Gnars NFT", address: GNARS_NFT_ADDRESS },
];

const TOKEN_PRESETS = [
  { label: "GNARS ERC20", address: DEFAULTS.gnarsToken },
];

const ERC20_ABI = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

const ERC721_ABI = [
  { type: "function", name: "approve", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "setApprovalForAll", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [], stateMutability: "nonpayable" },
];

const formatGnars = (amount, gnarsUnit) => {
  if (!gnarsUnit || gnarsUnit === 0n) return amount.toString();
  if (gnarsUnit === GNARS_UNIT_18) return ethers.formatUnits(amount, 18);
  return (amount / gnarsUnit).toString();
};

const parseGnarsInput = (value, gnarsUnit) => {
  if (!value) return 0n;
  if (!gnarsUnit || gnarsUnit === 0n || gnarsUnit === GNARS_UNIT_18) return ethers.parseUnits(value, 18);
  return BigInt(value) * gnarsUnit;
};

const matchPreset = (value, presets) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const preset = presets.find((item) => item.address.toLowerCase() === normalized);
  return preset?.address;
};

function AppV4() {
  const { address, isConnected } = useAccount();
  const [contractAddress, setContractAddress] = useState("");
  const [contractAddressInput, setContractAddressInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [contractInfo, setContractInfo] = useState({
    owner: "",
    treasury: "",
    subscriptionId: "",
    keyHash: "",
    callbackGasLimit: "",
    requestConfirmations: "",
    numWords: "",
    gnarsToken: "",
    gnarsUnit: 0n,
    minFlexEth: 0n,
    flexNothingBps: "",
    flexNftBpsMin: "",
    flexNftBpsMax: "",
    flexNftBpsPerEth: "",
    flexGnarsBase: 0n,
    flexGnarsPerEth: 0n,
  });

  // Deploy form
  const [deployForm, setDeployForm] = useState({
    coordinator: DEFAULTS.coordinator,
    subscriptionId: "",
    keyHash: DEFAULTS.keyHash,
    treasury: DEFAULTS.treasury,
    owner: "",
    gnarsToken: DEFAULTS.gnarsToken,
    gnarsUnit: DEFAULTS.gnarsUnit,
  });

  // User interaction
  const [paymentAmount, setPaymentAmount] = useState("0.0002");
  const [balances, setBalances] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  // Admin forms
  const [adminForm, setAdminForm] = useState({
    // Allowlist NFT
    allowlistNft: "",
    allowlistEnabled: true,
    // Deposit Gnars
    depositGnarsAmount: "",
    // Deposit NFT
    depositNft: "",
    depositTokenId: "",
    depositTokenIds: "",
    // VRF Config
    newSubscriptionId: "",
    vrfKeyHash: "",
    callbackGasLimit: "",
    requestConfirmations: "",
    numWords: "",
    // Request recovery
    retryRequestId: "",
    cancelRequestId: "",
    // Set Treasury
    newTreasury: "",
    // Flex Config
    minFlexEth: "",
    flexNothingBps: "",
    flexNftBpsMin: "",
    flexNftBpsMax: "",
    flexNftBpsPerEth: "",
    flexGnarsBase: "",
    flexGnarsPerEth: "",
    // Withdrawals
    withdrawGnarsAmount: "",
    withdrawGnarsTo: "",
    withdrawTokenAddress: "",
    withdrawTokenAmount: "",
    withdrawTokenTo: "",
    withdrawNftAddress: "",
    withdrawNftTokenId: "",
    withdrawNftTo: "",
    withdrawEthAmount: "",
    withdrawEthTo: "",
  });

  const activeGnarsUnit = contractInfo.gnarsUnit || BigInt(DEFAULTS.gnarsUnit);
  const activeGnarsToken = contractInfo.gnarsToken || deployForm.gnarsToken;
  const allowlistPresetValue = matchPreset(adminForm.allowlistNft, NFT_PRESETS) || CUSTOM_OPTION;
  const depositPresetValue = matchPreset(adminForm.depositNft, NFT_PRESETS) || CUSTOM_OPTION;
  const withdrawNftPresetValue = matchPreset(adminForm.withdrawNftAddress, NFT_PRESETS) || CUSTOM_OPTION;
  const withdrawTokenPresetValue = matchPreset(adminForm.withdrawTokenAddress, TOKEN_PRESETS) || CUSTOM_OPTION;
  const deployTokenPresetValue = matchPreset(deployForm.gnarsToken, TOKEN_PRESETS) || CUSTOM_OPTION;

  useEffect(() => {
    if (address) {
      setDeployForm(prev => ({ ...prev, owner: address }));
    }
  }, [address]);

  useEffect(() => {
    if (contractAddress && isConnected) {
      loadContractData();
    }
  }, [contractAddress, isConnected]);

  useEffect(() => {
    if (!contractAddress) return;
    localStorage.setItem("gnarsLootboxV4Address", contractAddress);
  }, [contractAddress]);

  useEffect(() => {
    const stored = localStorage.getItem("gnarsLootboxV4Address");
    if (stored) {
      setContractAddress(stored);
      setContractAddressInput(stored);
    }
  }, []);

  useEffect(() => {
    if (contractAddress && isConnected) {
      loadFlexPreview();
    }
  }, [contractAddress, isConnected, paymentAmount]);

  const applyContractAddress = () => {
    const next = contractAddressInput.trim();
    if (!next) {
      setStatusMessage("Enter a contract address.");
      return;
    }
    if (!ethers.isAddress(next)) {
      setStatusMessage("Invalid contract address.");
      return;
    }
    setContractAddressInput(next);
    setContractAddress(next);
    setStatusMessage(`Using contract ${next}`);
  };

  const loadContractData = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, V4_ABI, provider);

      const [
        flexBalances,
        paused,
        owner,
        treasury,
        subscriptionId,
        keyHash,
        callbackGasLimit,
        requestConfirmations,
        numWords,
        gnarsToken,
        gnarsUnit,
        minFlexEth,
        flexNothingBps,
        flexNftBpsMin,
        flexNftBpsMax,
        flexNftBpsPerEth,
        flexGnarsBase,
        flexGnarsPerEth,
      ] = await Promise.all([
        contract.getFlexBalances(),
        contract.paused(),
        contract.owner(),
        contract.treasury(),
        contract.subscriptionId(),
        contract.keyHash(),
        contract.callbackGasLimit(),
        contract.requestConfirmations(),
        contract.numWords(),
        contract.gnarsToken(),
        contract.gnarsUnit(),
        contract.minFlexEth(),
        contract.flexNothingBps(),
        contract.flexNftBpsMin(),
        contract.flexNftBpsMax(),
        contract.flexNftBpsPerEth(),
        contract.flexGnarsBase(),
        contract.flexGnarsPerEth(),
      ]);

      const [flexNftsAvailable, availableGnars, reservedGnars] = flexBalances;
      setBalances({ flexNftsAvailable, availableGnars, reservedGnars });
      setIsPaused(paused);
      setContractInfo({
        owner,
        treasury,
        subscriptionId,
        keyHash,
        callbackGasLimit,
        requestConfirmations,
        numWords,
        gnarsToken,
        gnarsUnit,
        minFlexEth,
        flexNothingBps,
        flexNftBpsMin,
        flexNftBpsMax,
        flexNftBpsPerEth,
        flexGnarsBase,
        flexGnarsPerEth,
      });
    } catch (err) {
      console.error("Failed to load contract data:", err);
    }
  };

  const loadFlexPreview = async () => {
    if (!paymentAmount) {
      setPreview(null);
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const contract = new ethers.Contract(contractAddress, V4_ABI, provider);
      const parsedPayment = ethers.parseEther(paymentAmount);
      const [nothingBps, nftBps, gnarsPayout] = await contract.getFlexPreview(parsedPayment);
      const minFlexEth = contractInfo.minFlexEth || (await contract.minFlexEth());
      setPreview({ nothingBps, nftBps, gnarsPayout, minFlexEth });
    } catch (err) {
      console.error("Failed to load preview:", err);
      setPreview(null);
    }
  };

  const deployContract = async () => {
    try {
      setStatusMessage("Deploying V4 contract...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const V4_BYTECODE = await fetch("/v4-bytecode.txt").then(r => r.text()).catch(() => null);
      if (!V4_BYTECODE) {
        setStatusMessage("Error: v4-bytecode.txt not found. Please compile the contract first.");
        return;
      }

      const factory = new ethers.ContractFactory(V4_ABI, V4_BYTECODE.trim(), signer);
      const contract = await factory.deploy(
        deployForm.coordinator,
        deployForm.subscriptionId,
        deployForm.keyHash,
        deployForm.treasury,
        deployForm.owner,
        deployForm.gnarsToken,
        deployForm.gnarsUnit
      );

      await contract.waitForDeployment();
      const addr = await contract.getAddress();

      setContractAddress(addr);
      setContractAddressInput(addr);
      setStatusMessage(`Deployed at: ${addr}`);
    } catch (err) {
      setStatusMessage(`Deploy failed: ${err.message}`);
    }
  };

  const openFlexBox = async () => {
    try {
      setStatusMessage("Opening flex box...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.openFlexBox({ value: ethers.parseEther(paymentAmount) });
      setStatusMessage(`Transaction sent: ${tx.hash}`);

      await tx.wait();
      setStatusMessage(`Flex box opened! Request ID in logs. Waiting for VRF...`);

      await loadContractData();
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const approveERC20 = async (tokenAddress, spender, amount) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      const tx = await token.approve(spender, amount);
      await tx.wait();
      setStatusMessage(`Approved ${amount} tokens`);
    } catch (err) {
      setStatusMessage(`Approval failed: ${err.message}`);
    }
  };

  const approveERC721 = async (nftAddress, spender, tokenId) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const nft = new ethers.Contract(nftAddress, ERC721_ABI, signer);

      const tx = await nft.approve(spender, tokenId);
      await tx.wait();
      setStatusMessage(`Approved NFT ${tokenId}`);
    } catch (err) {
      setStatusMessage(`NFT approval failed: ${err.message}`);
    }
  };

  const setAllowedERC721 = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.setAllowedERC721(adminForm.allowlistNft, adminForm.allowlistEnabled);
      await tx.wait();
      setStatusMessage(`NFT allowlist updated`);
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const depositGnars = async () => {
    try {
      const amount = parseGnarsInput(adminForm.depositGnarsAmount, activeGnarsUnit);
      await approveERC20(activeGnarsToken, contractAddress, amount);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.depositGnars(amount);
      await tx.wait();
      setStatusMessage(`Deposited ${adminForm.depositGnarsAmount} Gnars`);
      await loadContractData();
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const depositFlexNft = async () => {
    try {
      await approveERC721(adminForm.depositNft, contractAddress, adminForm.depositTokenId);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.depositFlexNft(adminForm.depositNft, adminForm.depositTokenId);
      await tx.wait();
      setStatusMessage(`Deposited NFT ${adminForm.depositTokenId}`);
      await loadContractData();
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const setTreasury = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.setTreasury(adminForm.newTreasury);
      await tx.wait();
      setStatusMessage(`Treasury updated to ${adminForm.newTreasury}`);
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const setFlexConfig = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = await contract.setFlexConfig(
        ethers.parseEther(adminForm.minFlexEth),
        adminForm.flexNothingBps,
        adminForm.flexNftBpsMin,
        adminForm.flexNftBpsMax,
        adminForm.flexNftBpsPerEth,
        parseGnarsInput(adminForm.flexGnarsBase, activeGnarsUnit),
        parseGnarsInput(adminForm.flexGnarsPerEth, activeGnarsUnit)
      );
      await tx.wait();
      setStatusMessage(`Flex config updated`);
      await loadContractData();
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const togglePause = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, V4_ABI, signer);

      const tx = isPaused ? await contract.unpause() : await contract.pause();
      await tx.wait();
      setStatusMessage(isPaused ? "Unpaused" : "Paused");
      await loadContractData();
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gnars Lootbox V4</h1>
        <ConnectButton />
      </header>

      {statusMessage && <div className="status-message">{statusMessage}</div>}

      <main className="App-main">
        <section className="deploy-section">
          <h2>Load Existing Contract</h2>
          <div className="form-group">
            <label>Contract Address:</label>
            <input
              value={contractAddressInput}
              onChange={(e) => setContractAddressInput(e.target.value)}
              placeholder="0x..."
            />
          </div>
          <button onClick={applyContractAddress} disabled={!isConnected}>
            Use Contract
          </button>
        </section>

        {/* Deploy Section */}
        <section className="deploy-section">
          <h2>Deploy V4 Contract</h2>
          <div className="form-group">
            <label>VRF Coordinator:</label>
            <input value={deployForm.coordinator} onChange={(e) => setDeployForm({...deployForm, coordinator: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Subscription ID:</label>
            <input value={deployForm.subscriptionId} onChange={(e) => setDeployForm({...deployForm, subscriptionId: e.target.value})} placeholder="Enter Chainlink VRF Subscription ID" />
          </div>
          <div className="form-group">
            <label>Key Hash:</label>
            <input value={deployForm.keyHash} onChange={(e) => setDeployForm({...deployForm, keyHash: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Treasury:</label>
            <input value={deployForm.treasury} onChange={(e) => setDeployForm({...deployForm, treasury: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Owner:</label>
            <input value={deployForm.owner} onChange={(e) => setDeployForm({...deployForm, owner: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Gnars Token:</label>
            <input value={deployForm.gnarsToken} onChange={(e) => setDeployForm({...deployForm, gnarsToken: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Gnars Unit (wei):</label>
            <input value={deployForm.gnarsUnit} onChange={(e) => setDeployForm({...deployForm, gnarsUnit: e.target.value})} />
          </div>
          <button onClick={deployContract} disabled={!isConnected}>Deploy Contract</button>
        </section>

        {/* Deployed Contract Address */}
        {contractAddress && (
          <section className="contract-address">
            <h3>Deployed Contract</h3>
            <p><strong>Address:</strong> {contractAddress}</p>
            <button onClick={loadContractData}>Refresh Data</button>
          </section>
        )}

        {/* Contract Stats */}
        {contractAddress && balances && (
          <section className="contract-stats">
            <h3>Contract Stats</h3>
            <p>Status: {isPaused ? "PAUSED" : "ACTIVE"}</p>
            <p>Flex NFTs Available: {balances.flexNftsAvailable.toString()}</p>
            <p>Available Gnars: {formatGnars(balances.availableGnars, activeGnarsUnit)}</p>
            <p>Reserved Gnars: {formatGnars(balances.reservedGnars, activeGnarsUnit)}</p>
          </section>
        )}

        {/* Open Flex Box */}
        {contractAddress && (
          <section className="open-box">
            <h2>Open Flex Box</h2>
            {preview && (
              <div className="preview">
                <p>Minimum: {ethers.formatEther(preview.minFlexEth)} ETH</p>
                <p>Nothing chance: {Number(preview.nothingBps) / 100}%</p>
                <p>NFT chance: {Number(preview.nftBps) / 100}%</p>
                <p>Gnars payout: {formatGnars(preview.gnarsPayout, activeGnarsUnit)}</p>
              </div>
            )}
            <div className="form-group">
              <label>Payment (ETH):</label>
              <input
                type="number"
                step="0.0001"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <button onClick={openFlexBox} disabled={!isConnected || isPaused}>
              {isPaused ? "Contract Paused" : "Open Flex Box"}
            </button>
          </section>
        )}

        {/* Admin Section */}
        {contractAddress && (
          <section className="admin-section">
            <h2>Admin Controls</h2>

            <div className="admin-group">
              <h3>Pause Control</h3>
              <button onClick={togglePause}>{isPaused ? "Unpause" : "Pause"}</button>
            </div>

            <div className="admin-group">
              <h3>Allowlist NFT</h3>
              <input placeholder="NFT Address" value={adminForm.allowlistNft} onChange={(e) => setAdminForm({...adminForm, allowlistNft: e.target.value})} />
              <label>
                <input type="checkbox" checked={adminForm.allowlistEnabled} onChange={(e) => setAdminForm({...adminForm, allowlistEnabled: e.target.checked})} />
                Allowed
              </label>
              <button onClick={setAllowedERC721}>Set Allowlist</button>
            </div>

            <div className="admin-group">
              <h3>Deposit Gnars</h3>
              <input placeholder="Amount (in Gnars)" value={adminForm.depositGnarsAmount} onChange={(e) => setAdminForm({...adminForm, depositGnarsAmount: e.target.value})} />
              <button onClick={depositGnars}>Deposit Gnars</button>
            </div>

            <div className="admin-group">
              <h3>Deposit Flex NFT</h3>
              <input placeholder="NFT Address" value={adminForm.depositNft} onChange={(e) => setAdminForm({...adminForm, depositNft: e.target.value})} />
              <input placeholder="Token ID" value={adminForm.depositTokenId} onChange={(e) => setAdminForm({...adminForm, depositTokenId: e.target.value})} />
              <button onClick={depositFlexNft}>Deposit NFT</button>
            </div>

            <div className="admin-group">
              <h3>Set Treasury</h3>
              <input placeholder="New Treasury Address" value={adminForm.newTreasury} onChange={(e) => setAdminForm({...adminForm, newTreasury: e.target.value})} />
              <button onClick={setTreasury}>Update Treasury</button>
            </div>

            <div className="admin-group">
              <h3>Set Flex Config</h3>
              <input placeholder="Min Flex ETH" value={adminForm.minFlexEth} onChange={(e) => setAdminForm({...adminForm, minFlexEth: e.target.value})} />
              <input placeholder="Nothing BPS" value={adminForm.flexNothingBps} onChange={(e) => setAdminForm({...adminForm, flexNothingBps: e.target.value})} />
              <input placeholder="NFT BPS Min" value={adminForm.flexNftBpsMin} onChange={(e) => setAdminForm({...adminForm, flexNftBpsMin: e.target.value})} />
              <input placeholder="NFT BPS Max" value={adminForm.flexNftBpsMax} onChange={(e) => setAdminForm({...adminForm, flexNftBpsMax: e.target.value})} />
              <input placeholder="NFT BPS Per ETH" value={adminForm.flexNftBpsPerEth} onChange={(e) => setAdminForm({...adminForm, flexNftBpsPerEth: e.target.value})} />
              <input placeholder="Gnars Base" value={adminForm.flexGnarsBase} onChange={(e) => setAdminForm({...adminForm, flexGnarsBase: e.target.value})} />
              <input placeholder="Gnars Per ETH" value={adminForm.flexGnarsPerEth} onChange={(e) => setAdminForm({...adminForm, flexGnarsPerEth: e.target.value})} />
              <button onClick={setFlexConfig}>Update Config</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default AppV4;
