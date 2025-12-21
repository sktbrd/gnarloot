import React from "react";
import ReactDOM from "react-dom/client";
import { RainbowKitProvider, darkTheme, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { WagmiConfig, configureChains, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { jsonRpcProvider } from "wagmi/providers/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "@rainbow-me/rainbowkit/styles.css";

const projectId = "985d5acd3d2c59c610bc7d9cd0023965"; // local-only project id

const baseRpc = import.meta.env.VITE_BASE_RPC_URL || "https://mainnet.base.org";

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [base],
  [
    jsonRpcProvider({
      rpc: () => ({ http: baseRpc }),
    }),
  ]
);

const { connectors } = getDefaultWallets({
  appName: "Gnars Lootbox V1 Deploy",
  projectId,
  chains,
});

const config = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          chains={chains}
          theme={darkTheme({
            accentColor: "#5df0c8",
            accentColorForeground: "#041014",
            borderRadius: "medium",
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  </React.StrictMode>
);
