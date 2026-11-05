"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hash, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { whitechainSepolia } from "./chains";
import { registry, REGISTRY_DEPLOY_BLOCK } from "./contracts";

// The public RPC's limit for one log request.
const BLOCKS_PER_REQUEST = 10_000n;

export type RefundRecord = {
  hash: Hash;
  amount: bigint;
  time: Date;
};

export type InvoiceRecords = {
  paidHash?: Hash;
  refunds: RefundRecord[];
};

async function readRecords(client: PublicClient, id: bigint): Promise<InvoiceRecords> {
  const latest = await client.getBlockNumber();
  const records: InvoiceRecords = { refunds: [] };

  for (let from = REGISTRY_DEPLOY_BLOCK; from <= latest; from += BLOCKS_PER_REQUEST) {
    const to = from + BLOCKS_PER_REQUEST - 1n < latest ? from + BLOCKS_PER_REQUEST - 1n : latest;
    const window = { args: { id }, fromBlock: from, toBlock: to };

    const [paid, refunded] = await Promise.all([
      client.getContractEvents({
        address: registry.address,
        abi: registry.abi,
        eventName: "InvoicePaid",
        ...window,
      }),
      client.getContractEvents({
        address: registry.address,
        abi: registry.abi,
        eventName: "InvoiceRefunded",
        ...window,
      }),
    ]);

    if (paid[0]) records.paidHash = paid[0].transactionHash;

    for (const log of refunded) {
      const block = await client.getBlock({ blockHash: log.blockHash });
      records.refunds.push({
        hash: log.transactionHash,
        amount: log.args.amount ?? 0n,
        time: new Date(Number(block.timestamp) * 1000),
      });
    }
  }

  return records;
}

// Payment and refund transactions. Refetches when the invoice's refunded total changes.
export function useInvoiceRecords(id: bigint | null, refunded: bigint | undefined) {
  const client = usePublicClient({ chainId: whitechainSepolia.id });

  return useQuery({
    queryKey: ["invoice-records", String(id), String(refunded)],
    queryFn: () => readRecords(client as PublicClient, id as bigint),
    enabled: Boolean(client) && id !== null && refunded !== undefined,
    staleTime: Infinity,
  });
}
