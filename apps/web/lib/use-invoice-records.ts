"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hash, PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import { whitechainSepolia } from "./chains";
import { registry, REGISTRY_DEPLOY_BLOCK } from "./contracts";
import type { Invoice } from "./invoice";

// The public RPC's limit for one log request.
const BLOCKS_PER_REQUEST = 10_000n;

export type InvoiceEvent = {
  hash: Hash;
  time: Date;
};

export type RefundRecord = InvoiceEvent & {
  amount: bigint;
};

export type InvoiceRecords = {
  created?: InvoiceEvent;
  paid?: InvoiceEvent;
  cancelled?: InvoiceEvent;
  refunds: RefundRecord[];
};

async function toEvent(
  client: PublicClient,
  log: { blockHash: Hash; transactionHash: Hash },
): Promise<InvoiceEvent> {
  const block = await client.getBlock({ blockHash: log.blockHash });
  return { hash: log.transactionHash, time: new Date(Number(block.timestamp) * 1000) };
}

async function readRecords(client: PublicClient, id: bigint): Promise<InvoiceRecords> {
  const latest = await client.getBlockNumber();
  const records: InvoiceRecords = { refunds: [] };
  const contract = { address: registry.address, abi: registry.abi };

  for (let from = REGISTRY_DEPLOY_BLOCK; from <= latest; from += BLOCKS_PER_REQUEST) {
    const end = from + BLOCKS_PER_REQUEST - 1n;
    const window = { args: { id }, fromBlock: from, toBlock: end < latest ? end : latest };

    const [created, paid, refunded, cancelled] = await Promise.all([
      client.getContractEvents({ ...contract, eventName: "InvoiceCreated", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoicePaid", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoiceRefunded", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoiceCancelled", ...window }),
    ]);

    if (created[0]) records.created = await toEvent(client, created[0]);
    if (paid[0]) records.paid = await toEvent(client, paid[0]);
    if (cancelled[0]) records.cancelled = await toEvent(client, cancelled[0]);
    for (const log of refunded) {
      records.refunds.push({
        ...(await toEvent(client, log)),
        amount: log.args.amount ?? 0n,
      });
    }
  }

  return records;
}

// The invoice's transactions. Reloads when its status or refunded total changes.
export function useInvoiceRecords(invoice: Invoice | undefined) {
  const client = usePublicClient({ chainId: whitechainSepolia.id });

  return useQuery({
    queryKey: [
      "invoice-records",
      String(invoice?.id),
      invoice?.status,
      String(invoice?.refunded),
    ],
    queryFn: () => readRecords(client as PublicClient, invoice?.id as bigint),
    enabled: Boolean(client) && invoice !== undefined,
    staleTime: Infinity,
  });
}
