"use client";

import { useQuery } from "@tanstack/react-query";

type RelayQuote = {
  available: boolean;
  relayFee: string;
  minInvoice: string;
  canWithdraw: boolean;
  withdrawFee: string;
};

// What the relayer charges, and whether it can send transactions at all.
export function useRelayQuote() {
  const { data, isPending } = useQuery({
    queryKey: ["relay-quote"],
    staleTime: 60_000,
    queryFn: async (): Promise<RelayQuote> => (await fetch("/api/relay/quote")).json(),
  });
  return {
    isPending,
    available: data?.available ?? false,
    relayFee: data ? BigInt(data.relayFee) : 0n,
    minInvoice: data ? BigInt(data.minInvoice) : 0n,
    canWithdraw: data?.canWithdraw ?? false,
    withdrawFee: data ? BigInt(data.withdrawFee) : 0n,
  };
}
