"use client";

import Link from "next/link";
import { useState } from "react";
import { zeroAddress } from "viem";
import type { AgentSale } from "@/lib/agent-sale";
import { formatDate, formatUsdt } from "@/lib/format";
import { buildInvoicesCsv } from "@/lib/invoices-csv";
import { logsClient } from "@/lib/logs-client";
import {
  invoiceState,
  type Invoice,
  type InvoiceState,
} from "@/lib/invoice";
import { customerContact, type InvoiceCustomer } from "@/lib/customer-invoices";
import { payUrl } from "@/lib/pay-link";
import { useAgentSales } from "@/lib/use-agent-sales";
import { useSubscriptionIncome, type SubscriptionIncome } from "@/lib/use-subscription-income";
import { useMerchantCustomers } from "@/lib/use-merchant-customers";
import { useMerchantInvoices } from "@/lib/use-merchant-invoices";
import { useMerchantProfile } from "@/lib/use-merchant-profile";
import { useMerchantPayments, type MerchantPayment } from "@/lib/use-merchant-payments";
import { useSession } from "@/lib/use-session";

import { AgentSales } from "./agent-sales";

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
  agentSales,
  subscriptionPayments,
}: {
  rows: { invoice: Invoice; state: InvoiceState }[];
  payments?: Map<string, MerchantPayment>;
  agentSales: AgentSale[];
  subscriptionPayments: SubscriptionIncome[];
}) {
  const open = rows.filter(({ state }) => state.group === "Open");
  const overdue = open.filter(({ state }) => state.isOverdue);
  const paid = rows.filter(({ invoice }) => invoice.payer !== zeroAddress);
  const refunded = paid.filter(({ invoice }) => invoice.refunded > 0n);
  const total = (items: typeof rows, read: (invoice: Invoice) => bigint) =>
    items.reduce((sum, { invoice }) => sum + read(invoice), 0n);
  // A relayed payment repays the relayer's gas out of the invoice. Nothing is owed afterwards.
  const relayed = paid.filter(({ invoice }) => payments?.get(String(invoice.id))?.gasless);
  // Sales to agents and subscription payments have no invoice, but they are money collected.
  const other =
    agentSales.reduce((sum, { amount }) => sum + BigInt(amount), 0n) +
    subscriptionPayments.reduce((sum, { amount }) => sum + amount, 0n);
  const otherFees =
    agentSales.reduce((sum, { networkFee }) => sum + BigInt(networkFee), 0n) +
    subscriptionPayments.reduce((sum, { fee }) => sum + fee, 0n);
  const otherCount = agentSales.length + subscriptionPayments.length;
  const collected = paid.length + otherCount;
  const feePayments = relayed.length + otherCount;

  return (
    <section
      aria-label="Summary"
      className="card grid grid-cols-2 gap-y-6 py-6 lg:grid-cols-5"
    >
      <Stat
        label="Collected"
        value={formatUsdt(total(paid, (invoice) => invoice.amount) + other)}
        detail={`USDT from ${collected} ${collected === 1 ? "payment" : "payments"}`}
      />
      <Stat
        label="Network fees"
        value={
          payments
            ? formatUsdt(
                total(relayed, (invoice) => payments.get(String(invoice.id))?.fee ?? 0n) + otherFees,
              )
            : "—"
        }
        detail={
          payments
            ? `USDT on ${feePayments} ${feePayments === 1 ? "payment" : "payments"}`
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
  agentSales,
  subscriptionPayments,
}: {
  invoices: Invoice[];
  now: bigint;
  customers: Map<string, InvoiceCustomer>;
  agentSales: AgentSale[];
  subscriptionPayments: SubscriptionIncome[];
}) {
  const { address } = useSession();
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    if (!address) return;
    setExporting(true);
    setFailed(false);
    try {
      const csv = await buildInvoicesCsv(
        logsClient,
        address,
        invoices,
        now,
        customers,
        agentSales,
        subscriptionPayments,
      );
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

type RowProps = {
  invoice: Invoice;
  state: InvoiceState;
  customer?: InvoiceCustomer;
  payment?: MerchantPayment;
  signedIn: boolean;
  isOrder: boolean;
};

function customerName(customer: InvoiceCustomer | undefined, isOrder: boolean) {
  return customer?.customerName || (isOrder ? "Store order" : "—");
}

// The customer's contact, or a store's own order number when it has no named customer.
function customerDetail(customer: InvoiceCustomer | undefined) {
  if (!customer) return "";
  return customerContact(customer) || customer.receipt;
}

function rowNotes(invoice: Invoice, payment?: MerchantPayment) {
  return [
    invoice.refunded > 0n && `${formatUsdt(invoice.refunded)} refunded`,
    payment && (payment.gasless ? `${formatUsdt(payment.fee)} network fee` : "no fee"),
  ].filter(Boolean);
}

function InvoiceRow({ invoice, state, customer, payment, signedIn, isOrder }: RowProps) {
  const isPaid = invoice.payer !== zeroAddress;
  const notes = rowNotes(invoice, payment);

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
            <div>{customerName(customer, isOrder)}</div>
            {customerDetail(customer) && (
              <div className="text-[13px]/[18px] text-muted">{customerDetail(customer)}</div>
            )}
          </>
        ) : (
          <span className="text-muted">Hidden</span>
        )}
      </td>
      <td>{isOrder ? "—" : formatDate(new Date(Number(invoice.dueAt) * 1000))}</td>
      <td>
        <span className={`pill ${state.tone}`}>{state.label}</span>
      </td>
      <td>
        {isPaid ? (
          formatDate(new Date(Number(invoice.paidAt) * 1000))
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
        <RowAction invoice={invoice} state={state} customer={customer} />
      </td>
    </tr>
  );
}

// The same row on a phone, where a table can't fit.
function InvoiceCard({ invoice, state, customer, payment, signedIn, isOrder }: RowProps) {
  const notes = rowNotes(invoice, payment);
  const named = customerName(customer, isOrder);
  const who = signedIn && named !== "—" ? named : "";
  const due = formatDate(new Date(Number(invoice.dueAt) * 1000));

  return (
    <li className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/dashboard/invoices/${invoice.id}`} className="figure text-accent-text">
            #{String(invoice.id)}
          </Link>
          {customer?.memo && <div className="mt-0.5 font-medium">{customer.memo}</div>}
          <div className="text-[13px]/[18px] text-muted">
            {[who, customerDetail(customer), !isOrder && `Due ${due}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="figure">{formatUsdt(invoice.amount)}</div>
          <div className="text-[13px]/[18px] text-muted">USDT</div>
        </div>
      </div>
      {notes.length > 0 && <div className="text-[13px]/[18px] text-muted">{notes.join(" · ")}</div>}
      <div className="flex items-center justify-between gap-3">
        <span className={`pill ${state.tone}`}>{state.label}</span>
        <RowAction invoice={invoice} state={state} customer={customer} />
      </div>
    </li>
  );
}

function RowAction({
  invoice,
  state,
  customer,
}: Pick<RowProps, "invoice" | "state" | "customer">) {
  if (state.group === "Open") return <CopyLinkButton id={invoice.id} linkKey={customer?.linkKey} />;
  return (
    <Link href={`/dashboard/invoices/${invoice.id}`} className="btn min-h-[38px]">
      View
    </Link>
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
  const agentSales = useAgentSales();
  const subscriptionPayments = useSubscriptionIncome(address);
  const { orders } = useMerchantProfile(address);
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
        <p className="text-muted">The network didn&apos;t respond. Your invoices are safe.</p>
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

  const rows = invoices.map((invoice) => {
    const isOrder = orders.has(String(invoice.id));
    return { invoice, isOrder, state: invoiceState(invoice, now, isOrder) };
  });
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
      customer?.receipt,
    ].some((value) => value?.toLowerCase().includes(term));
  });

  return (
    <>
      <Summary
        rows={rows}
        payments={payments}
        agentSales={agentSales}
        subscriptionPayments={subscriptionPayments}
      />
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
            <label className="min-w-[250px] flex-1">
              <span className="sr-only">Search invoices</span>
              <input
                className="input h-11 text-sm"
                type="search"
                placeholder={merchant.isUnlocked ? "Search customer or invoice" : "Search invoice number"}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <ExportButton
              invoices={invoices}
              now={now}
              customers={merchant.customers}
              agentSales={agentSales}
              subscriptionPayments={subscriptionPayments}
            />
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-line px-5 py-12 text-center text-muted">
            {term ? "No invoices match your search." : `No ${filter.toLowerCase()} invoices.`}
          </p>
        ) : (
          <>
          <ul aria-label="Your invoices" className="md:hidden">
            {visible.map(({ invoice, state, isOrder }) => (
              <InvoiceCard
                key={String(invoice.id)}
                invoice={invoice}
                state={state}
                isOrder={isOrder}
                customer={merchant.customers.get(String(invoice.id))}
                payment={payments?.get(String(invoice.id))}
                signedIn={merchant.isUnlocked}
              />
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <caption className="sr-only">Your invoices, newest first</caption>
              <thead>
                <tr>
                  <th scope="col" className="label">Invoice</th>
                  <th scope="col" className="label">Customer</th>
                  <th scope="col" className="label">Due</th>
                  <th scope="col" className="label">Status</th>
                  <th scope="col" className="label">Paid</th>
                  <th scope="col" className="label text-right">Amount</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ invoice, state, isOrder }) => (
                  <InvoiceRow
                    key={String(invoice.id)}
                    invoice={invoice}
                    state={state}
                    isOrder={isOrder}
                    customer={merchant.customers.get(String(invoice.id))}
                    payment={payments?.get(String(invoice.id))}
                    signedIn={merchant.isUnlocked}
                  />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  );
}

export function InvoicesPanel() {
  return (
    <>
      <InvoiceList />
      <AgentSales />
    </>
  );
}
