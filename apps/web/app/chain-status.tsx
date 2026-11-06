"use client";

import { useReadContract } from "wagmi";
import { registry } from "@/lib/contracts";
import { formatUsdt } from "@/lib/format";
import { useRelayQuote } from "@/lib/use-relay-quote";

export function ChainStatus() {
  const { data: nextId } = useReadContract({ ...registry, functionName: "nextId" });
  const { relayFee, isPending } = useRelayQuote();

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted">Orders and invoices</span>
        <span className="figure">{nextId === undefined ? "—" : String(nextId - 1n)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted">Network fee right now</span>
        <span className="figure">{isPending ? "—" : `${formatUsdt(relayFee)} USDT`}</span>
      </div>
    </>
  );
}

// The fee on a sale, for the comparison on the landing page.
export function LiveFee() {
  const { relayFee, isPending } = useRelayQuote();
  return <>{isPending ? "—" : `${formatUsdt(relayFee)} USDT`}</>;
}
