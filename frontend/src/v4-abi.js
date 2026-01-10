// V4 ABI - GnarsLootboxV4
export const V4_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "vrfCoordinator", type: "address", internalType: "address" },
      { name: "_subscriptionId", type: "uint256", internalType: "uint256" },
      { name: "_keyHash", type: "bytes32", internalType: "bytes32" },
      { name: "_treasury", type: "address", internalType: "address payable" },
      { name: "initialOwner", type: "address", internalType: "address" },
      { name: "_gnarsToken", type: "address", internalType: "address" },
      { name: "_gnarsUnit", type: "uint256", internalType: "uint256" }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "openFlexBox",
    inputs: [],
    outputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "minFlexEth",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getFlexBalances",
    inputs: [],
    outputs: [
      { name: "flexNftsAvailable", type: "uint256", internalType: "uint256" },
      { name: "availableGnars", type: "uint256", internalType: "uint256" },
      { name: "reservedGnars", type: "uint256", internalType: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getFlexPreview",
    inputs: [{ name: "paid", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "nothingBps", type: "uint16", internalType: "uint16" },
      { name: "nftBps", type: "uint16", internalType: "uint16" },
      { name: "gnarsPayout", type: "uint256", internalType: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "treasury",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address payable" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "gnarsToken",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC20" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "gnarsUnit",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "subscriptionId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "callbackGasLimit",
    inputs: [],
    outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "requestConfirmations",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "numWords",
    inputs: [],
    outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "keyHash",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "s_vrfCoordinator",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IVRFCoordinatorV2Plus" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexNothingBps",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexNftBpsMin",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexNftBpsMax",
    inputs: [],
    outputs: [{ name: "", type: "uint16", internalType: "uint16" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexNftBpsPerEth",
    inputs: [],
    outputs: [{ name: "", type: "uint32", internalType: "uint32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexGnarsBase",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexGnarsPerEth",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "flexNftRemaining",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pendingOpens",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "user", type: "address", internalType: "address" },
      { name: "paid", type: "uint256", internalType: "uint256" },
      { name: "flexGnarsPayout", type: "uint256", internalType: "uint256" },
      { name: "flexNothingBps", type: "uint16", internalType: "uint16" },
      { name: "flexNftBps", type: "uint16", internalType: "uint16" },
      { name: "fulfilled", type: "bool", internalType: "bool" },
      { name: "flexNftReserved", type: "bool", internalType: "bool" }
    ],
    stateMutability: "view"
  },
  // Admin functions
  {
    type: "function",
    name: "setAllowedERC721",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "allowed", type: "bool", internalType: "bool" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTreasury",
    inputs: [{ name: "_treasury", type: "address", internalType: "address payable" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setVrfConfig",
    inputs: [
      { name: "_callbackGasLimit", type: "uint32", internalType: "uint32" },
      { name: "_requestConfirmations", type: "uint16", internalType: "uint16" },
      { name: "_numWords", type: "uint32", internalType: "uint32" },
      { name: "_keyHash", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setSubscriptionId",
    inputs: [{ name: "_subscriptionId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setFlexConfig",
    inputs: [
      { name: "_minFlexEth", type: "uint256", internalType: "uint256" },
      { name: "_flexNothingBps", type: "uint16", internalType: "uint16" },
      { name: "_flexNftBpsMin", type: "uint16", internalType: "uint16" },
      { name: "_flexNftBpsMax", type: "uint16", internalType: "uint16" },
      { name: "_flexNftBpsPerEth", type: "uint32", internalType: "uint32" },
      { name: "_flexGnarsBase", type: "uint256", internalType: "uint256" },
      { name: "_flexGnarsPerEth", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "depositGnars",
    inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "depositFlexNft",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "depositFlexNftBatch",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenIds", type: "uint256[]", internalType: "uint256[]" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "retryOpen",
    inputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "newRequestId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelOpen",
    inputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "withdrawGnars",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "withdrawERC20",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "withdrawFlexNft",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "to", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "withdrawERC721",
    inputs: [
      { name: "nft", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "to", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "withdrawETH",
    inputs: [
      { name: "to", type: "address", internalType: "address payable" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "OpenRequested",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "paid", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "FlexOpened",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "paid", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "gnarsAmount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "nft", type: "address", indexed: false, internalType: "address" },
      { name: "tokenId", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "nothing", type: "bool", indexed: false, internalType: "bool" }
    ],
    anonymous: false
  }
];
