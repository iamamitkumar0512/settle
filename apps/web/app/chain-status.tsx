"use client";

import { useReadContract } from "wagmi";
import { registry } from "@/lib/contracts";

export function ChainStatus() {
  const { data: nextId } = useReadContract({ ...registry, functionName: "nextId" });

  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted">Invoices created</span>
      <span className="figure">{nextId === undefined ? "—" : String(nextId - 1n)}</span>
    </div>
  );
}
