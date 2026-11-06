"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { formatDate, formatUsdt } from "@/lib/format";
import { usePendingInvoices } from "@/lib/use-customer-invoices";

// The in-app reminder: invoices this account has to pay that are overdue or due within three
// days. It needs no email, so it reaches customers who were billed to a wallet address too.
export function PaymentReminders() {
  const { urgent } = usePendingInvoices();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState("");

  // Closing it hides these reminders only. A new one, or one turning overdue, shows it again.
  const current = urgent.map(({ invoice, state }) => `${invoice.id}:${state.label}`).join(",");
  if (urgent.length === 0 || dismissed === current) return null;

  const overdue = urgent.filter(({ state }) => state.isOverdue);
  const [first] = urgent;
  const total = urgent.reduce((sum, { invoice }) => sum + invoice.amount, 0n);
  const due = formatDate(new Date(Number(first.invoice.dueAt) * 1000));

  let title = `${urgent.length} invoices need paying`;
  let detail = `${formatUsdt(total)} USDT in total.`;
  if (overdue.length > 0 && overdue.length < urgent.length) {
    detail = `${overdue.length} overdue and ${urgent.length - overdue.length} due within 3 days. ${detail}`;
  } else {
    detail = `${overdue.length > 0 ? "All are overdue" : "All are due within 3 days"}. ${detail}`;
  }
  if (urgent.length === 1) {
    const from = first.merchantName ?? `Invoice #${first.invoice.id}`;
    title = first.merchantName
      ? `An invoice from ${from} is ${first.state.isOverdue ? "overdue" : "due soon"}`
      : `${from} is ${first.state.isOverdue ? "overdue" : "due soon"}`;
    detail = `${formatUsdt(first.invoice.amount)} USDT ${first.state.isOverdue ? "was" : "is"} due on ${due}.`;
  }

  const target = urgent.length === 1 ? `/pay/${first.invoice.id}` : "/pay";

  return (
    <section
      aria-label="Payment reminders"
      className={`card mx-auto mb-6 flex w-full max-w-[1376px] flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 ${
        overdue.length > 0 ? "tone-late" : "tone-due"
      }`}
      style={{ borderColor: "color-mix(in srgb, var(--tone) 55%, var(--line))" }}
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="font-semibold" style={{ color: "var(--tone)" }}>
          {title}
        </div>
        <div className="text-[13px]/[18px] text-muted">{detail}</div>
      </div>
      <div className="flex gap-2">
        {pathname !== target && (
          <Link href={target} className="btn btn-primary">
            {urgent.length === 1 ? "Pay now" : "See them"}
          </Link>
        )}
        <button type="button" className="btn" onClick={() => setDismissed(current)}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
