"use client";

import type { Address } from "viem";
import { explorerTxUrl, formatDateTime, formatUsdt, shortHash } from "@/lib/format";
import type { SubscriptionRecords } from "@/lib/use-subscription-records";

type Viewer = "customer" | "merchant";

// Who ended it, in the reader's own terms.
export function cancelledBy(by: Address, subscriber: Address, viewer: Viewer) {
  const bySubscriber = by.toLowerCase() === subscriber.toLowerCase();
  if (viewer === "customer") return bySubscriber ? "by you" : "by the business";
  return bySubscriber ? "by the customer" : "by you";
}

export function ProofLink({ hash }: { hash: `0x${string}` }) {
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

// Every step of a subscription, newest first, each with its proof on Whitechain.
export function SubscriptionHistory({
  records,
  subscriber,
  viewer,
}: {
  records: SubscriptionRecords | undefined;
  subscriber: Address;
  viewer: Viewer;
}) {
  if (!records?.started) return null;

  const entries = [
    ...(records.cancelled
      ? [
          {
            ...records.cancelled,
            key: "cancelled",
            title: `Cancelled ${cancelledBy(records.cancelled.by, subscriber, viewer)}`,
            amount: undefined as bigint | undefined,
          },
        ]
      : []),
    ...records.payments
      .map((payment) => ({ ...payment, key: payment.hash, title: "Payment" }))
      .reverse(),
    {
      ...records.started,
      key: "started",
      title: `Subscribed for up to ${records.started.payments} ${
        records.started.payments === 1 ? "payment" : "payments"
      }`,
      amount: undefined as bigint | undefined,
    },
  ];

  return (
    <details className="basis-full text-[13px]/[18px]">
      <summary className="cursor-pointer text-muted">History and proof</summary>
      <ul className="mt-2 flex flex-col">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-line py-2"
          >
            <span>
              {entry.title}
              <span className="text-muted"> · {formatDateTime(entry.time)}</span>
            </span>
            <span className="flex items-baseline gap-3">
              {entry.amount !== undefined && (
                <span className="figure">{formatUsdt(entry.amount)} USDT</span>
              )}
              <ProofLink hash={entry.hash} />
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
