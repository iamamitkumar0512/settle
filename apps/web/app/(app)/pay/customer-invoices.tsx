"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useReadContracts } from "wagmi";
import { registry } from "@/lib/contracts";
import type { CustomerInvoice } from "@/lib/customer-invoices";
import { formatDate, formatUsdt } from "@/lib/format";
import { invoiceState, toInvoice, type Invoice } from "@/lib/invoice";
import { useInvoiceDetails } from "@/lib/use-invoice-details";
import { postJson } from "@/lib/relay-client";
import { usePaidByWallet } from "@/lib/use-paid-by-wallet";
import { useSession } from "@/lib/use-session";

function useInvoicesById(ids: bigint[]) {
  const reads = useReadContracts({
    contracts: ids.map(
      (id) => ({ ...registry, functionName: "invoices", args: [id] }) as const,
    ),
    allowFailure: false,
    query: { enabled: ids.length > 0 },
  });
  return {
    invoices: (reads.data ?? []).map((row, index) => toInvoice(ids[index], row)),
    isLoading: ids.length > 0 && reads.isPending,
  };
}

function InvoiceCard({
  invoice,
  known,
  now,
}: {
  invoice: Invoice;
  known?: CustomerInvoice;
  now: bigint;
}) {
  const { data: details } = useInvoiceDetails(known ? undefined : invoice.id);
  const state = invoiceState(invoice, now);
  const name = known?.merchantName ?? details?.merchantName;
  const memo = known?.memo ?? details?.memo;
  const isOpen = state.group === "Open";

  return (
    <li className="card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="display text-lg">{name ?? `Invoice #${invoice.id}`}</span>
          <span className={`pill ${state.tone}`}>{state.label}</span>
        </div>
        {memo && <p className="mt-1 text-muted">{memo}</p>}
        <p className="mt-1 text-[13px]/[18px] text-muted">
          Invoice <span className="figure">#{String(invoice.id)}</span> · Due{" "}
          {formatDate(new Date(Number(invoice.dueAt) * 1000))}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="figure text-lg">{formatUsdt(invoice.amount)} USDT</span>
        {state.group !== "Cancelled" && (
          <Link
            href={isOpen ? `/pay/${invoice.id}` : `/pay/${invoice.id}/receipt`}
            className={`btn ${isOpen ? "btn-primary" : ""}`}
          >
            {isOpen ? "Pay" : "Receipt"}
          </Link>
        )}
      </div>
    </li>
  );
}

function InvoiceSections({
  invoices,
  known,
  emptyText,
}: {
  invoices: Invoice[];
  known: Map<string, CustomerInvoice>;
  emptyText: string;
}) {
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const newestFirst = [...invoices].sort((a, b) => Number(b.id - a.id));
  const pending = newestFirst.filter((invoice) => invoiceState(invoice, now).group === "Open");
  const past = newestFirst.filter((invoice) => invoiceState(invoice, now).group !== "Open");

  if (invoices.length === 0) {
    return <p className="card px-6 py-12 text-center text-muted">{emptyText}</p>;
  }

  return (
    <>
      {pending.length > 0 && (
        <section aria-label="To pay" className="flex flex-col gap-3">
          <h2 className="display text-xl">To pay</h2>
          <ul className="flex flex-col gap-3">
            {pending.map((invoice) => (
              <InvoiceCard
                key={String(invoice.id)}
                invoice={invoice}
                known={known.get(String(invoice.id))}
                now={now}
              />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-label="Past invoices" className="flex flex-col gap-3">
          <h2 className="display text-xl">Past invoices</h2>
          <ul className="flex flex-col gap-3">
            {past.map((invoice) => (
              <InvoiceCard
                key={String(invoice.id)}
                invoice={invoice}
                known={known.get(String(invoice.id))}
                now={now}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Invoices billed to this account's email, plus everything its wallet has paid.
export function CustomerInvoices() {
  const session = useSession();
  const { credentials } = session;

  const billed = useQuery({
    queryKey: ["customer-invoices", session.address],
    enabled: Boolean(credentials),
    queryFn: async () => {
      const result = await postJson("/api/customer/invoices", { credentials });
      if (!result.ok) throw new Error(result.error);
      return result.data.invoices as CustomerInvoice[];
    },
  });
  const paid = usePaidByWallet(session.address);

  const known = new Map((billed.data ?? []).map((invoice) => [invoice.id, invoice]));
  const ids = [
    ...new Set([...(billed.data ?? []).map((invoice) => BigInt(invoice.id)), ...(paid.data ?? [])]),
  ];
  const { invoices, isLoading } = useInvoicesById(ids);
  const isEmail = session.kind === "email";
  const loading = (Boolean(credentials) && billed.isPending) || paid.isPending || isLoading;

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <h1 className="display text-4xl/11">To pay</h1>
      {!isEmail && (
        <p className="text-[13px]/[18px] text-muted">
          A wallet shows the invoices it has paid. Invoices sent to an email address show when you
          log in with that email.
        </p>
      )}
      {billed.isError || paid.isError ? (
        <p role="alert" className="card px-6 py-12 text-center text-muted">
          We couldn&apos;t load your invoices. Refresh to try again.
        </p>
      ) : loading ? (
        <p className="card px-6 py-12 text-center text-muted">Loading your invoices…</p>
      ) : (
        <InvoiceSections
          invoices={invoices}
          known={known}
          emptyText={
            isEmail
              ? "No invoices have been sent to this email yet."
              : "This wallet hasn't paid any invoices yet."
          }
        />
      )}
    </main>
  );
}
