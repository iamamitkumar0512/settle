import { formatUsdt } from "./format";

function escapeText(text: string) {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Calendar files limit a line to 75 bytes. A longer one continues on the next line after a space.
function fold(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 74) {
      lines.push(current);
      current = " ";
      size = 1;
    }
    current += character;
    size += bytes;
  }
  lines.push(current);
  return lines.join("\r\n");
}

function day(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// A calendar file for an invoice's due date: an all-day event on the day the customer sees as
// due, with an alert at 9 in the morning the day before and again on the day. The customer's own
// calendar does the reminding, so it works with no email and nothing running on our side.
export function invoiceCalendarFile(event: {
  id: bigint;
  merchantName?: string;
  memo?: string;
  amount: bigint;
  dueAt: bigint;
  payUrl: string;
  createdAt: Date;
}) {
  const due = new Date(Number(event.dueAt) * 1000);
  const dayAfter = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1);
  const total = `${formatUsdt(event.amount)} USDT`;
  const summary = event.merchantName ? `Pay ${event.merchantName} ${total}` : `Pay ${total} invoice`;
  const description = [
    `Invoice #${event.id}${event.merchantName ? ` from ${event.merchantName}` : ""} for ${total}.`,
    ...(event.memo ? [event.memo] : []),
    `Pay it here: ${event.payUrl}`,
  ].join("\n");
  const stamp = `${event.createdAt.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const alert = (trigger: string) => [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Settle//Invoice due date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:settle-invoice-${event.id}@${new URL(event.payUrl).host}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(due)}`,
    `DTEND;VALUE=DATE:${day(dayAfter)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${event.payUrl}`,
    "TRANSP:TRANSPARENT",
    ...alert("-PT15H"),
    ...alert("PT9H"),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
