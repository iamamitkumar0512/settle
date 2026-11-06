import type { CustomerInvoice } from "@/lib/customer-invoices";
import { readCustomerInvoices } from "@/lib/server/arkiv";
import { authenticate } from "@/lib/server/auth";

export const maxDuration = 60;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Invoices sent to the logged-in customer's verified emails and wallets.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { credentials?: unknown } | null;
  const account = await authenticate(body?.credentials, request.headers.get("host"));
  if (!account) return fail(401, "log_in_again");

  try {
    const invoices: CustomerInvoice[] = [];
    for (const email of account.emails) invoices.push(...(await readCustomerInvoices({ email })));
    for (const wallet of account.wallets) {
      invoices.push(...(await readCustomerInvoices({ wallet })));
    }
    return Response.json({ invoices });
  } catch (error) {
    // The name only: messages can contain the keyed RPC URL.
    console.error("Reading customer invoices failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "failed");
  }
}
