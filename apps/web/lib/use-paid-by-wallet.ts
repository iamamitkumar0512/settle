"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { registry } from "./contracts";
import { logsClient } from "./logs-client";
import { blockWindows } from "./use-invoice-records";

// Payments are public on-chain, so a wallet's history needs no sign-in.
export function usePaidByWallet(payer: Address | undefined) {
  return useQuery({
    queryKey: ["paid-by-wallet", payer],
    enabled: Boolean(payer),
    queryFn: async () => {
      const latest = await logsClient.getBlockNumber();
      const ids: bigint[] = [];
      for (const blocks of blockWindows(latest)) {
        const logs = await logsClient.getContractEvents({
          address: registry.address,
          abi: registry.abi,
          eventName: "InvoicePaid",
          args: { payer },
          ...blocks,
        });
        for (const log of logs) if (log.args.id !== undefined) ids.push(log.args.id);
      }
      return ids;
    },
  });
}
