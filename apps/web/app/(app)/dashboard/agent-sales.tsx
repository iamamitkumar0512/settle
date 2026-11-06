"use client";

import type { Hash } from "viem";
import { explorerTxUrl, formatDateTime, formatUsdt, shortAddress, shortHash } from "@/lib/format";
import { useAgentSales } from "@/lib/use-agent-sales";

function Proof({ hash }: { hash: Hash }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="figure whitespace-nowrap text-[13px]/[18px] text-accent-text"
    >
      {shortHash(hash)} ↗
    </a>
  );
}

// Orders AI agents placed on this merchant's website. They are paid the moment they are made, so
// each one is finished.
export function AgentSales() {
  const sales = useAgentSales();
  if (sales.length === 0) return null;

  const total = sales.reduce((sum, { amount }) => sum + BigInt(amount), 0n);

  return (
    <section aria-label="Agent sales" className="card overflow-hidden">
      <div className="px-5 py-4 md:px-6">
        <h2 className="display text-xl">Agent sales</h2>
        <p className="text-[13px]/[18px] text-muted">
          {sales.length} {sales.length === 1 ? "order" : "orders"} placed by AI agents, worth{" "}
          {formatUsdt(total)} USDT. Each was paid as it was placed.
        </p>
      </div>
      <ul>
        {sales.map((sale) => (
          <li
            key={sale.transaction}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-t border-line px-5 py-3.5 md:px-6"
          >
            <div className="min-w-0">
              <div>{sale.description || "Agent order"}</div>
              <div className="text-[13px]/[18px] text-muted">
                <span className="figure">{sale.receipt}</span> ·{" "}
                {formatDateTime(new Date(sale.soldAt))} · from{" "}
                <span className="figure">{shortAddress(sale.payer)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="figure">+{formatUsdt(BigInt(sale.amount))} USDT</div>
              <div className="text-[13px]/[18px] text-muted">
                {formatUsdt(BigInt(sale.received))} after{" "}
                {formatUsdt(BigInt(sale.networkFee))} network fee
              </div>
              <Proof hash={sale.transaction} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
