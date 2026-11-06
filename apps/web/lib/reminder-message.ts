import { formatDate, formatUsdt } from "./format";

export type ReminderKind = "due_soon" | "overdue" | "manual";

// Merchants write these fields, so a line break must not be able to reshape the message.
function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

// The words of a payment reminder. Settle emails them, and a merchant can also send them from
// their own mail app or paste them into a chat.
export function reminderMessage(reminder: {
  kind: ReminderKind;
  merchantName: string;
  customerName: string;
  memo: string;
  amount: bigint;
  dueAt: bigint;
  payUrl: string;
}) {
  const business = oneLine(reminder.merchantName) || "A business";
  const customer = oneLine(reminder.customerName);
  const memo = oneLine(reminder.memo);
  const total = `${formatUsdt(reminder.amount)} USDT`;
  const due = formatDate(new Date(Number(reminder.dueAt) * 1000));

  let subject = `Reminder: ${total} invoice from ${business}`;
  if (reminder.kind === "due_soon") subject = `${total} invoice from ${business} is due ${due}`;
  if (reminder.kind === "overdue") subject = `Overdue: ${total} invoice from ${business}`;

  const greeting = customer ? `Hi ${customer},` : "Hi,";
  const invoiced = `${business} sent you an invoice for ${total}${memo ? `: ${memo}` : ""}.`;
  const status =
    reminder.kind === "overdue"
      ? `It was due on ${due} and hasn't been paid yet.`
      : `It is due on ${due}.`;
  const how = "You can pay with your email or a wallet, and you need no gas.";
  const text = [greeting, "", invoiced, status, "", `Pay it here: ${reminder.payUrl}`, "", how].join(
    "\n",
  );

  return { subject, business, total, greeting, invoiced, status, how, text };
}
