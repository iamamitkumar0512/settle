"use client";

import Link from "next/link";
import { useState } from "react";
import type { Hash } from "viem";
import { Message } from "@/components/message";
import {
  explorerTxUrl,
  formatDateTime,
  formatUsdt,
  shortAddress,
  shortHash,
} from "@/lib/format";
import { InvoiceStatus, invoiceState, type Invoice } from "@/lib/invoice";
import { useInvoice } from "@/lib/use-invoice";
import { useInvoiceRecords, type InvoiceRecords } from "@/lib/use-invoice-records";

function RecordLink({ hash }: { hash: Hash }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="figure whitespace-nowrap text-accent-text"
    >
      {shortHash(hash)} ↗
    </a>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]/[18px]">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function CopyLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn w-full" onClick={copy}>
      {copied ? "Link copied" : "Copy receipt link"}
    </button>
  );
}

function Refunds({
  invoice,
  records,
}: {
  invoice: Invoice;
  records: InvoiceRecords | undefined;
}) {
  if (invoice.refunded === 0n) {
    return (
      <div className="well">
        <div className="label mb-1">Refunds</div>
        <p className="text-[13px]/[18px] text-muted">None. Any refund will appear here.</p>
      </div>
    );
  }

  return (
    <div className="well flex flex-col gap-2.5">
      <div className="label">Refunds</div>
      {records?.refunds.map((refund) => (
        <div key={refund.hash} className="flex items-baseline justify-between gap-4">
          <div>
            <div>{refund.amount < invoice.amount ? "Partial refund" : "Full refund"}</div>
            <div className="text-[13px]/[18px] text-muted">
              {formatDateTime(refund.time)} · <RecordLink hash={refund.hash} />
            </div>
          </div>
          <span className="figure text-refund">+{formatUsdt(refund.amount)}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
        <strong className="font-semibold">Your total cost</strong>
        <span className="figure">{formatUsdt(invoice.amount - invoice.refunded)}</span>
      </div>
    </div>
  );
}

export function ReceiptPanel() {
  const { invoice, state } = useInvoice();
  const records = useInvoiceRecords(invoice);

  if (state === "notFound") {
    return <Message title="Receipt not found" text="Check the link and try again." />;
  }
  if (state === "error") {
    return (
      <Message
        title="Couldn't load this receipt"
        text="Whitechain didn't respond. Refresh the page to try again."
      />
    );
  }
  if (!invoice) {
    return <Message title="Loading receipt…" text="" />;
  }
  if (invoice.status === InvoiceStatus.Open || invoice.status === InvoiceStatus.Cancelled) {
    const cancelled = invoice.status === InvoiceStatus.Cancelled;
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="display text-2xl">
          {cancelled ? "This invoice was cancelled" : "This invoice isn't paid yet"}
        </h1>
        {!cancelled && (
          <Link href={`/pay/${invoice.id}`} className="btn btn-primary">
            Go to payment
          </Link>
        )}
      </main>
    );
  }

  const status = invoiceState(invoice, 0n);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-5 px-4 py-12">
      <section aria-label="Receipt" className="card flex flex-col gap-6 p-5 md:p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="figure text-[13px]/[18px]">{shortAddress(invoice.merchant)}</span>
          <span className={`pill ${status.tone}`}>{status.label}</span>
        </div>
        <div>
          <div className="text-muted">You paid</div>
          <div className="figure text-[38px]/[46px] tracking-tight md:text-[44px]/[52px]">
            {formatUsdt(invoice.amount)} <span className="text-lg text-muted">USDT</span>
          </div>
          <div className="text-[13px]/[18px] text-muted">
            {formatDateTime(new Date(Number(invoice.paidAt) * 1000))} · Invoice{" "}
            <span className="figure">#{String(invoice.id)}</span>
          </div>
        </div>
        <Refunds invoice={invoice} records={records.data} />
        <div className="flex flex-col gap-2 border-t border-dashed border-line-strong pt-4">
          <Row label="Paid from">
            <span className="figure">{shortAddress(invoice.payer)}</span>
          </Row>
          <Row label="Paid to">
            <span className="figure">{shortAddress(invoice.merchant)}</span>
          </Row>
          <Row label="Payment record">
            {records.data?.paid ? (
              <RecordLink hash={records.data.paid.hash} />
            ) : records.isError ? (
              <button
                type="button"
                className="text-accent-text underline"
                onClick={() => records.refetch()}
              >
                Couldn&apos;t load. Try again
              </button>
            ) : (
              <span className="text-muted">Loading…</span>
            )}
          </Row>
        </div>
      </section>
      <CopyLink />
      <p className="text-center text-[13px]/[18px] text-muted">
        These records are public, so you and the merchant can both check them at any time.
      </p>
    </main>
  );
}
