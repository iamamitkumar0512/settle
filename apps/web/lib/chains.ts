import { defineChain } from "viem";

export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.whitechain.io",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Whitechain Explorer",
      url: "https://explorer.testnet.whitechain.io",
    },
  },
  testnet: true,
});
