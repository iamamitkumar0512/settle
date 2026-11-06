"use client";

import Link from "next/link";
import { useState } from "react";
import type { Hash } from "viem";
import { useConnection } from "wagmi";
import { WalletGate } from "@/components/wallet-gate";
import { explorerTxUrl, formatDate, formatDateTime, formatUsdt, shortAddress, shortHash } from "@/lib/format";
import { InvoiceStatus, invoiceState, type Invoice } from "@/lib/invoice";
import { useInvoice } from "@/lib/use-invoice";
import { useInvoiceRecords, type InvoiceRecords } from "@/lib/use-invoice-records";
import { CancelCard, RefundCard } from "./invoice-actions";

type TimelineEntry = {
  key: string;
  tone: string;
  title: string;
  detail: string;
  amount?: string;
  hash: Hash;
};

function timeline(invoice: Invoice, records: InvoiceRecords) {
  const entries: (TimelineEntry & { time: Date })[] = [];
  if (records.created) {
    entries.push({
      ...records.created,
      key: "created",
      tone: "",
      title: "Invoice created",
      detail: formatDateTime(records.created.time),
    });
  }
  if (records.paid) {
    entries.push({
      ...records.paid,
      key: "paid",
      tone: "tone-paid",
      title: "Paid",
      detail: `${formatDateTime(records.paid.time)} · from ${shortAddress(invoice.payer)}`,
      amount: `+${formatUsdt(invoice.amount)}`,
    });
  }
  for (const refund of records.refunds) {
    entries.push({
      ...refund,
      key: refund.hash,
      tone: "tone-refund",
      title: "Refund sent",
      detail: `${formatDateTime(refund.time)} · to ${shortAddress(invoice.payer)}`,
      amount: `−${formatUsdt(refund.amount)}`,
    });
  }
  if (records.cancelled) {
    entries.push({
      ...records.cancelled,
      key: "cancelled",
      tone: "",
      title: "Invoice cancelled",
      detail: formatDateTime(records.cancelled.time),
    });
  }
  return entries.sort((a, b) => b.time.getTime() - a.time.getTime());
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="md:border-l md:border-line md:pl-6 md:first:border-l-0 md:first:pl-0">
      <div className="label">{label}</div>
      <div className={`figure mt-1.5 text-2xl/8 ${tone ?? ""}`}>{value}</div>
      <div className="text-[13px]/[18px] text-muted">USDT</div>
    </div>
  );
}

function Timeline({ invoice }: { invoice: Invoice }) {
  const records = useInvoiceRecords(invoice);

  return (
    <section aria-label="Timeline" className="card p-6">
      <h2 className="display mb-2 text-xl">Timeline</h2>
      {records.data ? (
        timeline(invoice, records.data).map((entry) => (
          <div key={entry.key} className="flex gap-3.5 border-t border-line py-3.5">
            <span
              aria-hidden="true"
              className={`pill mt-1.5 h-2.5 w-2.5 shrink-0 p-0 before:hidden ${entry.tone} bg-[var(--tone,var(--muted))]`}
            />
            <div className="min-w-0 flex-1">
              <div>{entry.title}</div>
              <div className="text-[13px]/[18px] text-muted">{entry.detail}</div>
            </div>
            <div className="text-right">
              {entry.amount && <div className="figure">{entry.amount}</div>}
              <a
                href={explorerTxUrl(entry.hash)}
                target="_blank"
                rel="noreferrer"
                className="figure whitespace-nowrap text-[13px]/[18px] text-accent-text"
              >
                {shortHash(entry.hash)} ↗
              </a>
            </div>
          </div>
        ))
      ) : records.isError ? (
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3.5">
          <p className="text-muted">Couldn&apos;t load the timeline.</p>
          <button type="button" className="btn" onClick={() => records.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <p className="border-t border-line pt-3.5 text-muted">Loading…</p>
      )}
    </section>
  );
}

function Detail({ invoice, onChanged }: { invoice: Invoice; onChanged: () => Promise<unknown> }) {
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const state = invoiceState(invoice, now);
  const isPaid = invoice.status === InvoiceStatus.Paid || invoice.status === InvoiceStatus.Refunded;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section className="card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-[32px]/10">
              Invoice <span className="figure">#{String(invoice.id)}</span>
            </h1>
            <span className={`pill ${state.tone}`}>{state.label}</span>
          </div>
          <p className="mt-1 mb-5 text-muted">
            Due {formatDate(new Date(Number(invoice.dueAt) * 1000))}
            {isPaid && (
              <>
                {" · "}
                <Link href={`/pay/${invoice.id}/receipt`} className="text-accent-text">
                  Customer receipt
                </Link>
              </>
            )}
          </p>
          <div className="grid grid-cols-1 gap-5 border-t border-line pt-5 md:grid-cols-3">
            <Stat label="Invoiced" value={formatUsdt(invoice.amount)} />
            <Stat
              label="Refunded"
              value={invoice.refunded > 0n ? `−${formatUsdt(invoice.refunded)}` : "0.00"}
              tone={invoice.refunded > 0n ? "text-refund" : undefined}
            />
            <Stat
              label="You kept"
              value={isPaid ? formatUsdt(invoice.amount - invoice.refunded) : "0.00"}
            />
          </div>
        </section>
        <Timeline invoice={invoice} />
      </div>
      <aside className="card flex flex-col gap-4 p-5">
        {invoice.status === InvoiceStatus.Open && (
          <CancelCard invoice={invoice} onChanged={onChanged} />
        )}
        {isPaid && <RefundCard invoice={invoice} onChanged={onChanged} />}
        {invoice.status === InvoiceStatus.Cancelled && (
          <>
            <h2 className="display text-xl">Cancelled</h2>
            <p className="text-muted">This invoice can no longer be paid.</p>
          </>
        )}
      </aside>
    </div>
  );
}

function Loaded() {
  const { invoice, state, refetch } = useInvoice();
  const { address } = useConnection();

  if (state === "notFound") {
    return <p className="card px-6 py-16 text-center">Invoice not found.</p>;
  }
  if (state === "error") {
    return (
      <p role="alert" className="card px-6 py-16 text-center text-muted">
        Whitechain didn&apos;t respond. Refresh the page to try again.
      </p>
    );
  }
  if (!invoice) {
    return (
      <p role="status" className="card px-6 py-16 text-center text-muted">
        Loading invoice…
      </p>
    );
  }
  if (invoice.merchant.toLowerCase() !== address?.toLowerCase()) {
    return (
      <p className="card px-6 py-16 text-center text-muted">
        This invoice belongs to another merchant account.
      </p>
    );
  }

  return <Detail invoice={invoice} onChanged={refetch} />;
}

export function InvoiceDetail() {
  return (
    <WalletGate>
      <Loaded />
    </WalletGate>
  );
}
