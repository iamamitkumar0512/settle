import "server-only";
import type { Invoice } from "@/lib/invoice";
import { reminderMessage, type ReminderKind } from "@/lib/reminder-message";
import { readInvoiceContact } from "./arkiv";
import { sendEmail } from "./email";
import { payLinkKey } from "./pay-link";

const DAY = 86_400n;
const DUE_SOON_DAYS = 3n;
const OVERDUE_DAYS = 1n;

// One reminder shortly before the due date and one shortly after. The job runs once a day and
// each window is a day wide, so an invoice falls into each window on exactly one run. That is
// what stops a reminder repeating, with nothing to remember.
export function scheduledReminder(dueAt: bigint, now: bigint): ReminderKind | null {
  if (dueAt === 0n) return null;
  const untilDue = dueAt - now;
  if (untilDue > (DUE_SOON_DAYS - 1n) * DAY && untilDue <= DUE_SOON_DAYS * DAY) return "due_soon";
  const overdueFor = now - dueAt;
  if (overdueFor >= OVERDUE_DAYS * DAY && overdueFor < (OVERDUE_DAYS + 1n) * DAY) return "overdue";
  return null;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function reminderEmail(reminder: Parameters<typeof reminderMessage>[0]) {
  const { subject, business, total, greeting, invoiced, status, how, text } =
    reminderMessage(reminder);
  const footer = `Settle sent this for ${business}. If you weren't expecting it, you can ignore it.`;

  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:24px;color:#161c04;max-width:480px">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(invoiced)}<br>${escapeHtml(status)}</p>
<p><a href="${escapeHtml(reminder.payUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#c8f04d;color:#161c04;font-weight:600;text-decoration:none">Pay ${escapeHtml(total)}</a></p>
<p style="color:#5b6052">${escapeHtml(how)}</p>
<p style="color:#5b6052;font-size:13px;line-height:18px">${escapeHtml(footer)}</p>
</div>`;

  return { subject, text: `${text}\n\n${footer}`, html };
}

// Emails the invoice's customer. Returns false when there is nothing to send: the invoice went to
// a wallet address, its details were never saved, or it is a store's order.
export async function sendInvoiceReminder(invoice: Invoice, kind: ReminderKind, origin: string) {
  const contact = await readInvoiceContact(invoice.id);
  // A store's unpaid order is an abandoned cart, not a debt to chase.
  if (!contact?.customerEmail || contact.isOrder) return false;

  await sendEmail({
    to: contact.customerEmail,
    ...reminderEmail({
      kind,
      merchantName: contact.merchantName,
      customerName: contact.customerName,
      memo: contact.memo,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
      // The key lets the customer open the invoice's PDF straight from the email.
      payUrl: `${origin}/pay/${invoice.id}#k=${payLinkKey(invoice.id)}`,
    }),
  });
  return true;
}
