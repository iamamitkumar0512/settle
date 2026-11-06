"use client";

import { useState } from "react";
import type { Invoice } from "@/lib/invoice";
import { payUrl } from "@/lib/pay-link";
import { postJson } from "@/lib/relay-client";
import { reminderMessage } from "@/lib/reminder-message";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";

export type ReminderContact = {
  merchantName?: string;
  customerName?: string;
  customerEmail?: string;
  customerWallet?: string;
  memo?: string;
  linkKey?: string;
};

const SEND_ERRORS: Record<string, string> = {
  reminder_already_sent: "A reminder already went out today. You can send another tomorrow.",
  no_customer_email: "This invoice has no email address to send to.",
  InvoiceNotOpen: "This invoice was already paid or cancelled.",
  log_in_again: "Your session ended. Log in again.",
  network: "We couldn't reach Settle. Check your connection.",
};

// Three ways to nudge a customer, and the first two need nothing but the merchant's own tools:
// their mail app, a copied message for any chat, or an email sent by Settle when it is set up.
export function RemindCustomer({
  invoice,
  contact,
  isOverdue,
}: {
  invoice: Invoice;
  contact: ReminderContact;
  isOverdue: boolean;
}) {
  const { credentials } = useSession();
  const { canSendReminders } = useRelayQuote();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Remind customer
      </button>
    );
  }

  const message = reminderMessage({
    kind: isOverdue ? "overdue" : "manual",
    merchantName: contact.merchantName ?? "",
    customerName: contact.customerName ?? "",
    memo: contact.memo ?? "",
    amount: invoice.amount,
    dueAt: invoice.dueAt,
    payUrl: payUrl(invoice.id, contact.linkKey),
  });
  const text = contact.merchantName
    ? `${message.text}\n\nThanks,\n${message.business}`
    : message.text;
  const email = contact.customerEmail;
  const canSend = Boolean(email && credentials && canSendReminders);
  const mailto = email
    ? `mailto:${encodeURIComponent(email).replace("%40", "@")}?subject=${encodeURIComponent(
        message.subject,
      )}&body=${encodeURIComponent(text)}`
    : undefined;

  let intro = "Copy this message and send it to your customer.";
  if (email) {
    intro = canSend
      ? `Settle can email this to ${email}, or you can send it yourself.`
      : `Send this to ${email} from your own mail app, or copy it.`;
  } else if (contact.customerWallet) {
    intro =
      "This invoice went to a wallet address, so there is no email to send to. Copy the message and send it wherever you talk to this customer. They also see a reminder in Settle when they log in.";
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function send() {
    setError(undefined);
    setSending(true);
    const result = await postJson(`/api/invoices/${invoice.id}/reminder`, { credentials });
    setSending(false);
    if (result.ok) return setSent(true);
    setError(SEND_ERRORS[result.error] ?? "Couldn't send the reminder. Try one of the other ways.");
  }

  return (
    <div className="well flex flex-col gap-3">
      <p className="text-[13px]/[18px] text-muted">{intro}</p>
      <p className="rounded-lg border border-line bg-raised p-3 text-[13px]/[18px] break-words whitespace-pre-wrap">
        {text}
      </p>
      {canSend && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={sending || sent}
          onClick={send}
        >
          {sent ? "Reminder sent" : sending ? "Sending…" : "Email it from Settle"}
        </button>
      )}
      {mailto && (
        <a href={mailto} className={`btn ${canSend ? "" : "btn-primary"}`}>
          Open in my mail app
        </a>
      )}
      <button type="button" className={`btn ${email ? "" : "btn-primary"}`} onClick={copy}>
        {copied ? "Message copied" : "Copy message"}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Close
      </button>
      {sent && (
        <p role="status" className="text-[13px]/[18px] text-paid">
          Sent to {email}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
    </div>
  );
}
