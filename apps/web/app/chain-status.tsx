"use client";

import { useReadContract } from "wagmi";
import { invoiceRegistryAbi, REGISTRY_ADDRESS } from "@/lib/contracts";

export function ChainStatus() {
  const { data: nextId, isPending, isError } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: invoiceRegistryAbi,
    functionName: "nextId",
  });

  if (isPending) return <p className="text-muted">Connecting to Whitechain…</p>;
  if (isError) return <p className="text-muted">Could not reach Whitechain.</p>;
  return <p className="text-muted">Invoices created on Whitechain Sepolia: <span className="figure">{String(nextId - 1n)}</span></p>;
}
