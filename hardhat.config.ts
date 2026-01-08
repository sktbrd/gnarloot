import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-preprocessor";
import * as fs from "fs";
import * as path from "path";

// Read remappings from remappings.txt (Foundry style)
function getRemappings() {
  const remappingsPath = path.join(__dirname, "remappings.txt");
  if (!fs.existsSync(remappingsPath)) {
    return [];
  }

  return fs
    .readFileSync(remappingsPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.trim().split("="));
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  preprocess: {
    eachLine: (hre) => ({
      transform: (line: string) => {
        if (line.match(/^\s*import /i)) {
          for (const [from, to] of getRemappings()) {
            if (line.includes(from)) {
              line = line.replace(from, to);
            }
          }
        }
        return line;
      },
    }),
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: {
        url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
        enabled: process.env.FORK_ENABLED === "true",
      },
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
