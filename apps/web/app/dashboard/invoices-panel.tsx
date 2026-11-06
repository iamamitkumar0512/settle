"use client";

import Link from "next/link";
import { useState } from "react";
import { zeroAddress } from "viem";
import { useConnection } from "wagmi";
import { WalletGate } from "@/components/wallet-gate";
import { formatDate, formatUsdt, shortAddress } from "@/lib/format";
import {
  invoiceState,
  type Invoice,
  type InvoiceState,
} from "@/lib/invoice";
import { useMerchantInvoices } from "@/lib/use-merchant-invoices";

const FILTERS = ["All", "Open", "Paid", "Refunded", "Cancelled"] as const;
type Filter = (typeof FILTERS)[number];

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="px-6 md:border-l md:border-line md:first:border-l-0">
      <div className="label">{label}</div>
      <div className={`figure mt-1.5 text-3xl/[38px] ${tone ?? ""}`}>{value}</div>
      <div className="text-[13px]/[18px] text-muted">{detail}</div>
    </div>
  );
}

function plural(count: number) {
  return `USDT on ${count} ${count === 1 ? "invoice" : "invoices"}`;
}

function Summary({ rows }: { rows: { invoice: Invoice; state: InvoiceState }[] }) {
  const open = rows.filter(({ state }) => state.group === "Open");
  const overdue = open.filter(({ state }) => state.isOverdue);
  const paid = rows.filter(({ invoice }) => invoice.payer !== zeroAddress);
  const refunded = paid.filter(({ invoice }) => invoice.refunded > 0n);
  const total = (items: typeof rows, read: (invoice: Invoice) => bigint) =>
    items.reduce((sum, { invoice }) => sum + read(invoice), 0n);

  return (
    <section
      aria-label="Summary"
      className="card grid grid-cols-2 gap-y-6 py-6 md:grid-cols-4"
    >
      <Stat
        label="Collected"
        value={formatUsdt(total(paid, (invoice) => invoice.amount))}
        detail={`USDT from ${paid.length} ${paid.length === 1 ? "payment" : "payments"}`}
      />
      <Stat
        label="Outstanding"
        value={formatUsdt(total(open, (invoice) => invoice.amount))}
        detail={plural(open.length)}
      />
      <Stat
        label="Overdue"
        value={formatUsdt(total(overdue, (invoice) => invoice.amount))}
        detail={plural(overdue.length)}
        tone={overdue.length > 0 ? "text-late" : undefined}
      />
      <Stat
        label="Refunded"
        value={formatUsdt(total(refunded, (invoice) => invoice.refunded))}
        detail={plural(refunded.length)}
      />
    </section>
  );
}

function CopyLinkButton({ id }: { id: bigint }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`${window.location.origin}/pay/${id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn min-h-[38px]" onClick={copy}>
      {copied ? "Link copied" : "Copy pay link"}
    </button>
  );
}

function InvoiceRow({ invoice, state }: { invoice: Invoice; state: InvoiceState }) {
  const isPaid = invoice.payer !== zeroAddress;

  return (
    <tr>
      <td className="figure">
        <Link href={`/dashboard/invoices/${invoice.id}`} className="text-accent-text">
          #{String(invoice.id)}
        </Link>
      </td>
      <td>{formatDate(new Date(Number(invoice.dueAt) * 1000))}</td>
      <td>
        <span className={`pill ${state.tone}`}>{state.label}</span>
      </td>
      <td>
        {isPaid ? (
          <>
            <div className="figure">{shortAddress(invoice.payer)}</div>
            <div className="text-[13px]/[18px] text-muted">
              {formatDate(new Date(Number(invoice.paidAt) * 1000))}
            </div>
          </>
        ) : (
          <span className="text-muted">Not paid</span>
        )}
      </td>
      <td className="text-right">
        <div className="figure">{formatUsdt(invoice.amount)}</div>
        <div className="text-[13px]/[18px] text-muted">
          {invoice.refunded > 0n ? `${formatUsdt(invoice.refunded)} refunded` : "USDT"}
        </div>
      </td>
      <td className="text-right">
        {state.group === "Open" && <CopyLinkButton id={invoice.id} />}
        {state.group !== "Open" && (
          <Link href={`/dashboard/invoices/${invoice.id}`} className="btn min-h-[38px]">
            View
          </Link>
        )}
      </td>
    </tr>
  );
}

function InvoiceList() {
  const { address } = useConnection();
  const { invoices, isLoading, isError, retry } = useMerchantInvoices(address);
  const [filter, setFilter] = useState<Filter>("All");
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  if (isError) {
    return (
      <section role="alert" className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">Couldn&apos;t load your invoices</h2>
        <p className="text-muted">Whitechain didn&apos;t respond. Your invoices are safe on-chain.</p>
        <button type="button" className="btn" onClick={retry}>
          Try again
        </button>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="card px-6 py-16 text-center text-muted" role="status">
        Loading your invoices…
      </section>
    );
  }

  if (invoices.length === 0) {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">No invoices yet</h2>
        <p className="text-muted">Create your first invoice and share its pay link.</p>
        <Link href="/dashboard/new" className="btn btn-primary">
          New invoice
        </Link>
      </section>
    );
  }

  const rows = invoices.map((invoice) => ({
    invoice,
    state: invoiceState(invoice, now),
  }));
  const visible = rows.filter(({ state }) => filter === "All" || state.group === filter);

  return (
    <>
      <Summary rows={rows} />
      <section aria-label="Invoices" className="card overflow-hidden">
        <div className="flex flex-wrap gap-3 px-5 py-4">
          <div role="group" aria-label="Filter by status" className="segmented max-w-full overflow-x-auto">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-line px-5 py-12 text-center text-muted">
            No {filter.toLowerCase()} invoices.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Your invoices, newest first</caption>
              <thead>
                <tr>
                  <th scope="col" className="label">Invoice</th>
                  <th scope="col" className="label">Due</th>
                  <th scope="col" className="label">Status</th>
                  <th scope="col" className="label">Paid by</th>
                  <th scope="col" className="label text-right">Amount</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ invoice, state }) => (
                  <InvoiceRow key={String(invoice.id)} invoice={invoice} state={state} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function InvoicesPanel() {
  return (
    <WalletGate>
      <InvoiceList />
    </WalletGate>
  );
}
