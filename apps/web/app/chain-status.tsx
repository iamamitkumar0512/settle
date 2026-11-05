"use client";

import { useReadContract } from "wagmi";
import { invoiceRegistryAbi, REGISTRY_ADDRESS } from "@/lib/contracts";

export function ChainStatus() {
  const { data: nextId, isPending, isError } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: invoiceRegistryAbi,
    functionName: "nextId",
  });

  if (isPending) return <p>Connecting to Whitechain…</p>;
  if (isError) return <p>Could not reach Whitechain.</p>;
  return <p>Invoices created on Whitechain Sepolia: {String(nextId - 1n)}</p>;
}
