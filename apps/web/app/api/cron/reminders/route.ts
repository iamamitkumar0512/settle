import { isAuthorizedCron } from "@/lib/server/cron";
import { emailConfigured } from "@/lib/server/email";
import { DAY } from "@/lib/server/rate-limit";
import { readOpenInvoices } from "@/lib/server/invoices";
import { requestOrigin } from "@/lib/server/relay-http";
import { scheduledReminder, sendInvoiceReminder } from "@/lib/server/reminders";

export const maxDuration = 60;

// Keeps one run inside the time limit.
const REMINDERS_PER_RUN = 40;

// What this server already sent, so a second run on the same day doesn't repeat it. Kept in
// memory, like the rate limits.
const alreadySent = new Map<string, number>();

// Emails the reminders that fall due today. Meant to run once a day: see scheduledReminder.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    return Response.json({ error: "reminders_not_configured" }, { status: 503 });
  }

  try {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const open = await readOpenInvoices();
    const due = open
      .map((invoice) => ({ invoice, kind: scheduledReminder(invoice.dueAt, now) }))
      .filter(
        ({ invoice, kind }) =>
          kind !== null && Date.now() - (alreadySent.get(`${invoice.id}:${kind}`) ?? 0) >= DAY,
      )
      .slice(0, REMINDERS_PER_RUN);

    const sent: { id: string; kind: string }[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];
    const origin = requestOrigin(request);
    for (const { invoice, kind } of due) {
      const id = String(invoice.id);
      try {
        // Invoices sent to a wallet address have no email, so they are skipped.
        if (kind && (await sendInvoiceReminder(invoice, kind, origin))) {
          alreadySent.set(`${id}:${kind}`, Date.now());
          sent.push({ id, kind });
        } else {
          skipped.push(id);
        }
      } catch {
        failed.push(id);
      }
    }
    return Response.json({ open: open.length, sent, skipped, failed });
  } catch (error) {
    // The name only: messages can contain a keyed RPC URL.
    console.error("Sending reminders failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
