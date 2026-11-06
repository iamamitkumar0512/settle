"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

const NO_ORDERS: string[] = [];

// The name on this merchant's latest invoice, and which of their invoices are store orders.
export function useMerchantProfile(merchant: Address | undefined) {
  const { data } = useQuery({
    queryKey: ["merchant-profile", merchant],
    enabled: Boolean(merchant),
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ businessName: string; orderIds: string[] }> => {
      const response = await fetch(`/api/merchants/${merchant}/profile`);
      if (!response.ok) throw new Error("Couldn't load the profile");
      return response.json();
    },
  });
  const orderIds = data?.orderIds ?? NO_ORDERS;

  return {
    businessName: data?.businessName ?? "",
    orders: useMemo(() => new Set(orderIds), [orderIds]),
  };
}
