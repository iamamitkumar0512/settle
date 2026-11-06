"use client";

import { zeroAddress, type Address } from "viem";
import { useReadContract } from "wagmi";
import { whitechainSepolia } from "./chains";
import { usdtAbi, USDT_ADDRESS } from "./contracts";

export function useUsdtBalance(address: Address | undefined) {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: usdtAbi,
    chainId: whitechainSepolia.id,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: 5_000 },
  });
}
