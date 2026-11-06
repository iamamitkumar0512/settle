"use client";

import Link from "next/link";
import { useState } from "react";
import { zeroAddress } from "viem";
import { formatDate, formatUsdt, shortAddress } from "@/lib/format";
import { buildInvoicesCsv } from "@/lib/invoices-csv";
import { logsClient } from "@/lib/logs-client";
import {
  invoiceState,
  type Invoice,
  type InvoiceState,
} from "@/lib/invoice";
import { customerContact, type InvoiceCustomer } from "@/lib/customer-invoices";
import { payUrl } from "@/lib/pay-link";
import { useMerchantCustomers } from "@/lib/use-merchant-customers";
import { useMerchantInvoices } from "@/lib/use-merchant-invoices";
import { useMerchantPayments, type MerchantPayment } from "@/lib/use-merchant-payments";
import { useSession } from "@/lib/use-session";

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
    <div className="px-6 lg:border-l lg:border-line lg:first:border-l-0">
      <div className="label">{label}</div>
      <div className={`figure mt-1.5 text-3xl/[38px] ${tone ?? ""}`}>{value}</div>
      <div className="text-[13px]/[18px] text-muted">{detail}</div>
    </div>
  );
}

function plural(count: number) {
  return `USDT on ${count} ${count === 1 ? "invoice" : "invoices"}`;
}

function Summary({
  rows,
  payments,
}: {
  rows: { invoice: Invoice; state: InvoiceState }[];
  payments?: Map<string, MerchantPayment>;
}) {
  const open = rows.filter(({ state }) => state.group === "Open");
  const overdue = open.filter(({ state }) => state.isOverdue);
  const paid = rows.filter(({ invoice }) => invoice.payer !== zeroAddress);
  const refunded = paid.filter(({ invoice }) => invoice.refunded > 0n);
  const total = (items: typeof rows, read: (invoice: Invoice) => bigint) =>
    items.reduce((sum, { invoice }) => sum + read(invoice), 0n);
  // A relayed payment repays the relayer's gas out of the invoice. Nothing is owed afterwards.
  const relayed = paid.filter(({ invoice }) => payments?.get(String(invoice.id))?.gasless);

  return (
    <section
      aria-label="Summary"
      className="card grid grid-cols-2 gap-y-6 py-6 lg:grid-cols-5"
    >
      <Stat
        label="Collected"
        value={formatUsdt(total(paid, (invoice) => invoice.amount))}
        detail={`USDT from ${paid.length} ${paid.length === 1 ? "payment" : "payments"}`}
      />
      <Stat
        label="Network fees"
        value={
          payments
            ? formatUsdt(total(relayed, (invoice) => payments.get(String(invoice.id))?.fee ?? 0n))
            : "—"
        }
        detail={
          payments
            ? `USDT of gas on ${relayed.length} gasless ${relayed.length === 1 ? "payment" : "payments"}`
            : "Loading…"
        }
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

function CopyLinkButton({ id, linkKey }: { id: bigint; linkKey?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(payUrl(id, linkKey));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn min-h-[38px]" onClick={copy}>
      {copied ? "Link copied" : "Copy pay link"}
    </button>
  );
}

function ExportButton({
  invoices,
  now,
  customers,
}: {
  invoices: Invoice[];
  now: bigint;
  customers: Map<string, InvoiceCustomer>;
}) {
  const { address } = useSession();
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    if (!address) return;
    setExporting(true);
    setFailed(false);
    try {
      const csv = await buildInvoicesCsv(logsClient, address, invoices, now, customers);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `settle-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFailed(true);
    }
    setExporting(false);
  }

  return (
    <div className="flex items-center gap-3">
      {failed && (
        <span role="alert" className="text-[13px]/[18px] text-late">
          Couldn&apos;t export. Try again.
        </span>
      )}
      <button type="button" className="btn" disabled={exporting} onClick={download}>
        {exporting ? "Preparing…" : "Export CSV"}
      </button>
    </div>
  );
}

function InvoiceRow({
  invoice,
  state,
  customer,
  payment,
  signedIn,
}: {
  invoice: Invoice;
  state: InvoiceState;
  customer?: InvoiceCustomer;
  payment?: MerchantPayment;
  signedIn: boolean;
}) {
  const isPaid = invoice.payer !== zeroAddress;
  const notes = [
    invoice.refunded > 0n && `${formatUsdt(invoice.refunded)} refunded`,
    payment && (payment.gasless ? `${formatUsdt(payment.fee)} network fee` : "no fee"),
  ].filter(Boolean);

  return (
    <tr>
      <td className="figure">
        <Link href={`/dashboard/invoices/${invoice.id}`} className="text-accent-text">
          #{String(invoice.id)}
        </Link>
        {customer?.memo && (
          <div className="font-sans text-[13px]/[18px] font-normal text-muted">{customer.memo}</div>
        )}
      </td>
      <td>
        {signedIn ? (
          <>
            <div>{customer?.customerName || "—"}</div>
            {customer && customerContact(customer) && (
              <div className="text-[13px]/[18px] text-muted">{customerContact(customer)}</div>
            )}
          </>
        ) : (
          <span className="text-muted">Hidden</span>
        )}
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
          {notes.length > 0 ? notes.join(" · ") : "USDT"}
        </div>
      </td>
      <td className="text-right">
        {state.group === "Open" && <CopyLinkButton id={invoice.id} linkKey={customer?.linkKey} />}
        {state.group !== "Open" && (
          <Link href={`/dashboard/invoices/${invoice.id}`} className="btn min-h-[38px]">
            View
          </Link>
        )}
      </td>
    </tr>
  );
}

function CustomerSignIn() {
  const { signIn } = useSession();

  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <div className="font-semibold">Customer details are private</div>
        <div className="text-[13px]/[18px] text-muted">
          Sign one message in your wallet to see them. It costs no gas.
        </div>
      </div>
      <button type="button" className="btn" onClick={() => signIn().catch(() => undefined)}>
        Show customer details
      </button>
    </section>
  );
}

function InvoiceList() {
  const session = useSession();
  const { address } = session;
  const merchant = useMerchantCustomers();
  const { invoices, isLoading, isError, retry } = useMerchantInvoices(address);
  const payments = useMerchantPayments(
    address,
    invoices.filter((invoice) => invoice.payer !== zeroAddress).length,
  );
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
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
  const term = search.trim().toLowerCase();
  const visible = rows.filter(({ invoice, state }) => {
    if (filter !== "All" && state.group !== filter) return false;
    if (!term) return true;
    const customer = merchant.customers.get(String(invoice.id));
    return [
      `#${invoice.id}`,
      customer?.memo,
      customer?.customerName,
      customer?.customerEmail,
      customer?.customerWallet,
    ].some((value) => value?.toLowerCase().includes(term));
  });

  return (
    <>
      <Summary rows={rows} payments={payments} />
      {session.kind === "wallet" && !merchant.isUnlocked && <CustomerSignIn />}
      {merchant.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {merchant.error}
        </p>
      )}
      <section aria-label="Invoices" className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-[200px] flex-1">
              <span className="sr-only">Search invoices</span>
              <input
                className="input h-11 text-sm"
                type="search"
                placeholder={merchant.isUnlocked ? "Search customer or invoice" : "Search invoice number"}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <ExportButton invoices={invoices} now={now} customers={merchant.customers} />
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-line px-5 py-12 text-center text-muted">
            {term ? "No invoices match your search." : `No ${filter.toLowerCase()} invoices.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Your invoices, newest first</caption>
              <thead>
                <tr>
                  <th scope="col" className="label">Invoice</th>
                  <th scope="col" className="label">Customer</th>
                  <th scope="col" className="label">Due</th>
                  <th scope="col" className="label">Status</th>
                  <th scope="col" className="label">Paid by</th>
                  <th scope="col" className="label text-right">Amount</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ invoice, state }) => (
                  <InvoiceRow
                    key={String(invoice.id)}
                    invoice={invoice}
                    state={state}
                    customer={merchant.customers.get(String(invoice.id))}
                    payment={payments?.get(String(invoice.id))}
                    signedIn={merchant.isUnlocked}
                  />
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
  return <InvoiceList />;
}
