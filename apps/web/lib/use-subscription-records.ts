"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Address, Hash, PublicClient } from "viem";
import { subscriptions as contract } from "./contracts";
import { logsClient } from "./logs-client";
import type { Subscription } from "./subscription";
import { blockWindows, type InvoiceEvent } from "./use-invoice-records";

// What happened to one subscription, each step with the transaction that proves it. Settle's
// relayer sends these transactions, so they are not in the customer's or the merchant's own list
// on the explorer. This is where both of them find the proof.
export type SubscriptionPayment = InvoiceEvent & {
  amount: bigint;
  /** Kept back from the merchant to repay gas. */
  fee: bigint;
};

export type SubscriptionRecords = {
  started?: InvoiceEvent & { payments: number };
  payments: SubscriptionPayment[];
  cancelled?: InvoiceEvent & { by: Address };
};

// The event log can be a moment behind the contract, so a transaction that just went through may
// not be in it yet. This is how often to look again, and how many times before giving up.
const RECHECK_MS = 5_000;
const MAX_READS = 8;

// Whether the events account for everything the contract says has happened.
function isComplete(subscription: Subscription, records: SubscriptionRecords | undefined) {
  if (!records?.started) return false;
  const made = records.started.payments - subscription.periodsLeft;
  if (records.payments.length < made) return false;
  const stillRunning = subscription.active || subscription.periodsLeft === 0;
  return stillRunning || records.cancelled !== undefined;
}

async function readRecords(client: PublicClient, ids: bigint[]) {
  // Not the cached number: it can be older than the transaction this read is looking for.
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  const byId = new Map<string, SubscriptionRecords>(
    ids.map((id) => [String(id), { payments: [] }]),
  );
  const source = { address: contract.address, abi: contract.abi };

  // Subscribing and its first payment share a block, so each block's time is read once.
  const times = new Map<Hash, Promise<Date>>();
  async function toEvent(log: { blockHash: Hash; transactionHash: Hash }): Promise<InvoiceEvent> {
    let time = times.get(log.blockHash);
    if (!time) {
      time = client
        .getBlock({ blockHash: log.blockHash })
        .then((block) => new Date(Number(block.timestamp) * 1000));
      times.set(log.blockHash, time);
    }
    return { hash: log.transactionHash, time: await time };
  }

  for (const blocks of blockWindows(latest)) {
    const window = { args: { id: ids }, ...blocks };
    const [started, charged, cancelled] = await Promise.all([
      client.getContractEvents({ ...source, eventName: "Subscribed", ...window }),
      client.getContractEvents({ ...source, eventName: "Charged", ...window }),
      client.getContractEvents({ ...source, eventName: "SubscriptionCancelled", ...window }),
    ]);

    for (const log of started) {
      const records = byId.get(String(log.args.id));
      if (records) records.started = { ...(await toEvent(log)), payments: log.args.periods ?? 0 };
    }
    for (const log of charged) {
      const records = byId.get(String(log.args.id));
      if (records) {
        records.payments.push({
          ...(await toEvent(log)),
          amount: log.args.amount ?? 0n,
          fee: log.args.relayFee ?? 0n,
        });
      }
    }
    for (const log of cancelled) {
      const records = byId.get(String(log.args.id));
      if (records && log.args.by) records.cancelled = { ...(await toEvent(log)), by: log.args.by };
    }
  }

  return byId;
}

// The history of these subscriptions. It reloads when one is added, charged or ended.
export function useSubscriptionRecords(list: Subscription[]) {
  const ids = list.map(({ id }) => id);
  const version = list.map((item) => `${item.id}:${item.periodsLeft}:${item.active}`).join(",");
  const records = useQuery({
    queryKey: ["subscription-records", version],
    queryFn: () => readRecords(logsClient, ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
    // The last answer stays on screen while a change is being read.
    placeholderData: keepPreviousData,
    refetchInterval: ({ state }) => {
      const done = list.every((item) => isComplete(item, state.data?.get(String(item.id))));
      return done || state.dataUpdateCount + state.errorUpdateCount >= MAX_READS
        ? false
        : RECHECK_MS;
    },
  });

  return (id: bigint) => records.data?.get(String(id));
}
