import type { InvoiceCustomer } from "@/lib/customer-invoices";
import { readMerchantCustomers } from "@/lib/server/arkiv";
import { authenticate } from "@/lib/server/auth";

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Decrypted details go only to the logged-in merchant, and only for their own invoices.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { credentials?: unknown } | null;
  const account = await authenticate(body?.credentials, request.headers.get("host"));
  if (!account) return fail(401, "log_in_again");

  try {
    const customers: InvoiceCustomer[] = [];
    for (const wallet of account.wallets) customers.push(...(await readMerchantCustomers(wallet)));
    return Response.json({ customers });
  } catch (error) {
    // The name only: messages can contain the keyed RPC URL.
    console.error("Reading customers failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "failed");
  }
}
