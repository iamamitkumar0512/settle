import { InvoiceStatus } from "@/lib/invoice";
import { authenticate } from "@/lib/server/auth";
import { describeEmailError, emailConfigured, EmailError } from "@/lib/server/email";
import { DAY } from "@/lib/server/rate-limit";
import { requestOrigin } from "@/lib/server/relay-http";
import { readInvoice, RelayError } from "@/lib/server/relayer";
import { sendInvoiceReminder } from "@/lib/server/reminders";

export const maxDuration = 60;

// When each invoice's merchant last sent a reminder. Kept in memory, like the rate limits.
const lastSent = new Map<string, number>();

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Emails the customer a reminder, when the invoice's merchant asks. Once a day per invoice.
export async function POST(request: Request, context: RouteContext<"/api/invoices/[id]/reminder">) {
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(rawId)) return fail(400, "invalid_request");
  const id = BigInt(rawId);
  if (!emailConfigured()) return fail(503, "reminders_not_configured");

  const body = (await request.json().catch(() => null)) as { credentials?: unknown } | null;
  const account = await authenticate(body?.credentials, request.headers.get("host"));
  if (!account) return fail(401, "log_in_again");

  try {
    const { invoice } = await readInvoice(id);
    const isMerchant = account.wallets.some(
      (wallet) => wallet.toLowerCase() === invoice.merchant.toLowerCase(),
    );
    if (!isMerchant) return fail(403, "not_your_invoice");
    if (invoice.status !== InvoiceStatus.Open) return fail(409, "InvoiceNotOpen");
    if (Date.now() - (lastSent.get(rawId) ?? 0) < DAY) return fail(429, "reminder_already_sent");

    const now = BigInt(Math.floor(Date.now() / 1000));
    const kind = invoice.dueAt !== 0n && invoice.dueAt < now ? "overdue" : "manual";
    if (!(await sendInvoiceReminder(invoice, kind, requestOrigin(request)))) {
      return fail(400, "no_customer_email");
    }
    lastSent.set(rawId, Date.now());
    return Response.json({ sent: true });
  } catch (error) {
    if (error instanceof RelayError) return fail(error.status, error.code);
    if (error instanceof EmailError) {
      console.error(describeEmailError(error));
      // The other two ways still work, so the page says which one failed and why.
      return error.fault === "test_sender"
        ? fail(503, "reminders_test_mode")
        : fail(502, "failed");
    }
    // The name only: messages can contain a keyed RPC URL or an email address.
    console.error("Sending a reminder failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "failed");
  }
}
