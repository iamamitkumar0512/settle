"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { whitechainSepolia } from "./chains";
import { invoiceRegistryAbi, REGISTRY_ADDRESS } from "./contracts";
import type { Invoice } from "./invoice";

const REFRESH_MS = 15_000;

const registry = {
  address: REGISTRY_ADDRESS,
  abi: invoiceRegistryAbi,
  chainId: whitechainSepolia.id,
} as const;

// Reads every invoice in one multicall and keeps this merchant's. Current state comes straight from
// the contract, so this needs no event scan, whose block range Ankr limits.
export function useMerchantInvoices(merchant: Address | undefined) {
  const nextId = useReadContract({
    ...registry,
    functionName: "nextId",
    query: { refetchInterval: REFRESH_MS },
  });

  const count = nextId.data === undefined ? 0 : Number(nextId.data) - 1;
  const ids = Array.from({ length: count }, (_, index) => BigInt(index + 1));

  const reads = useReadContracts({
    contracts: ids.map(
      (id) => ({ ...registry, functionName: "invoices", args: [id] }) as const,
    ),
    allowFailure: false,
    query: { enabled: count > 0, refetchInterval: REFRESH_MS },
  });

  const invoices: Invoice[] = (reads.data ?? [])
    .map((row, index) => {
      const [invoiceMerchant, payer, amount, refunded, dueAt, paidAt, status] = row;
      return {
        id: ids[index],
        merchant: invoiceMerchant,
        payer,
        amount,
        refunded,
        dueAt,
        paidAt,
        status,
      };
    })
    .filter((invoice) => invoice.merchant.toLowerCase() === merchant?.toLowerCase())
    .reverse();

  return {
    invoices,
    isLoading: nextId.isPending || (count > 0 && reads.isPending),
    // A failed refresh keeps showing the last good data.
    isError:
      (nextId.isError && nextId.data === undefined) ||
      (reads.isError && reads.data === undefined),
    retry: () => {
      nextId.refetch();
      if (count > 0) reads.refetch();
    },
  };
}
