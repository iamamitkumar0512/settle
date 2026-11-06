"use client";

import { zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { subscriptions } from "./contracts";
import { toPlan, toSubscription } from "./subscription";

const REFRESH_MS = 15_000;

function idsBelow(next: bigint | undefined) {
  const count = next === undefined ? 0 : Number(next) - 1;
  return Array.from({ length: count }, (_, index) => BigInt(index + 1));
}

// Every plan, read in one multicall. Callers keep the ones they need.
export function usePlans() {
  const next = useReadContract({
    ...subscriptions,
    functionName: "nextPlanId",
    query: { refetchInterval: REFRESH_MS },
  });
  const ids = idsBelow(next.data);
  const reads = useReadContracts({
    contracts: ids.map((id) => ({ ...subscriptions, functionName: "plans", args: [id] }) as const),
    allowFailure: false,
    query: { enabled: ids.length > 0, refetchInterval: REFRESH_MS },
  });

  return {
    plans: (reads.data ?? []).map((row, index) => toPlan(ids[index], row)),
    isLoading: next.isPending || (ids.length > 0 && reads.isPending),
    isError: (next.isError && next.data === undefined) || (reads.isError && reads.data === undefined),
    refetch: async () => {
      await next.refetch();
      await reads.refetch();
    },
  };
}

// Every subscription, the same way.
export function useSubscriptions() {
  const next = useReadContract({
    ...subscriptions,
    functionName: "nextSubscriptionId",
    query: { refetchInterval: REFRESH_MS },
  });
  const ids = idsBelow(next.data);
  const reads = useReadContracts({
    contracts: ids.map(
      (id) => ({ ...subscriptions, functionName: "subscriptions", args: [id] }) as const,
    ),
    allowFailure: false,
    query: { enabled: ids.length > 0, refetchInterval: REFRESH_MS },
  });

  return {
    subscriptions: (reads.data ?? []).map((row, index) => toSubscription(ids[index], row)),
    isLoading: next.isPending || (ids.length > 0 && reads.isPending),
    isError: (next.isError && next.data === undefined) || (reads.isError && reads.data === undefined),
    refetch: async () => {
      await next.refetch();
      await reads.refetch();
    },
  };
}

export function usePlan(id: bigint | null) {
  const read = useReadContract({
    ...subscriptions,
    functionName: "plans",
    args: [id ?? 0n],
    query: { enabled: id !== null, refetchInterval: REFRESH_MS },
  });
  const plan = id !== null && read.data ? toPlan(id, read.data) : undefined;

  let state: "loading" | "ready" | "notFound" | "error" = "loading";
  if (id === null || plan?.merchant === zeroAddress) state = "notFound";
  else if (plan) state = "ready";
  else if (read.isError) state = "error";

  return { plan, state };
}
