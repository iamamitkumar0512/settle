import { createPublicClient, http, isHex, zeroAddress, type Hex } from "viem";
import { whitechainSepolia } from "@/lib/chains";
import { registry } from "@/lib/contracts";
import { hashInvoiceDetails, INVOICE_LIMITS, toInvoice } from "@/lib/invoice";
import { invoiceRecordExists, readPublicDetails, writeInvoiceRecord } from "@/lib/server/arkiv";

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

function parseBody(body: unknown) {
  if (typeof body !== "object" || body === null) return null;
  const { merchantName, customerName, customerEmail, memo, salt } = body as Record<string, unknown>;
  if (
    typeof merchantName !== "string" ||
    typeof customerName !== "string" ||
    typeof customerEmail !== "string" ||
    typeof memo !== "string" ||
    typeof salt !== "string" ||
    !isHex(salt) ||
    salt.length !== 66
  ) {
    return null;
  }
  if (
    merchantName.trim().length === 0 ||
    utf8Bytes(merchantName) > INVOICE_LIMITS.merchantNameBytes ||
    utf8Bytes(customerName) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(customerEmail) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(memo) > INVOICE_LIMITS.memoBytes
  ) {
    return null;
  }
  return { merchantName, customerName, customerEmail, memo, salt: salt as Hex };
}

// Public fields only, so anyone with a pay link can read them.
export async function GET(_request: Request, context: RouteContext<"/api/invoices/[id]/details">) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(id)) return fail(400, "Invalid invoice");

  try {
    const details = await readPublicDetails(BigInt(id));
    return details ? Response.json(details) : fail(404, "No saved details");
  } catch (error) {
    console.error("Reading invoice details failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "Couldn't load invoice details");
  }
}

export async function POST(request: Request, context: RouteContext<"/api/invoices/[id]/details">) {
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(rawId)) return fail(400, "Invalid invoice");
  const id = BigInt(rawId);

  const details = parseBody(await request.json().catch(() => null));
  if (!details) return fail(400, "Invalid invoice details");

  const chain = createPublicClient({
    chain: whitechainSepolia,
    transport: http(process.env.RPC_ENDPOINT),
  });

  try {
    const row = await chain.readContract({ ...registry, functionName: "invoices", args: [id] });
    const invoice = toInvoice(id, row);
    if (invoice.merchant === zeroAddress) return fail(404, "Invoice not found");

    // Only someone holding the exact details committed on-chain can save them.
    const { salt, ...fields } = details;
    if (hashInvoiceDetails(fields, salt) !== row[7]) {
      return fail(403, "Details don't match this invoice");
    }

    if (await invoiceRecordExists(id)) return Response.json({ saved: true });

    const { entityKey, txHash } = await writeInvoiceRecord({
      ...details,
      id,
      merchant: invoice.merchant,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
    });
    return Response.json({ saved: true, entityKey, txHash });
  } catch (error) {
    // The name only: messages can contain the keyed RPC URL.
    console.error("Saving invoice details failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "Couldn't save invoice details");
  }
}
