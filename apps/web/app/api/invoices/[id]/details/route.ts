import { zeroAddress } from "viem";
import { registry } from "@/lib/contracts";
import { hashInvoiceDetails, toInvoice } from "@/lib/invoice";
import {
  invoiceRecordExists,
  readInvoiceFile,
  readPublicDetails,
  writeInvoiceRecord,
} from "@/lib/server/arkiv";
import { parseInvoiceDetails } from "@/lib/server/invoice-details";
import { chainClient } from "@/lib/server/relayer";

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// Public fields only, so anyone with a pay link can read them.
export async function GET(_request: Request, context: RouteContext<"/api/invoices/[id]/details">) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(id)) return fail(400, "Invalid invoice");

  try {
    const [details, file] = await Promise.all([
      readPublicDetails(BigInt(id)),
      readInvoiceFile(BigInt(id)),
    ]);
    if (!details) return fail(404, "No saved details");
    // Whether a PDF exists is public. Opening it is not: see the pdf route.
    return Response.json({ ...details, hasPdf: file !== null });
  } catch (error) {
    console.error("Reading invoice details failed:", error instanceof Error ? error.name : "unknown");
    return fail(502, "Couldn't load invoice details");
  }
}

export async function POST(request: Request, context: RouteContext<"/api/invoices/[id]/details">) {
  const { id: rawId } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(rawId)) return fail(400, "Invalid invoice");
  const id = BigInt(rawId);

  const details = parseInvoiceDetails(await request.json().catch(() => null));
  if (!details) return fail(400, "Invalid invoice details");

  try {
    const row = await chainClient.readContract({
      address: registry.address,
      abi: registry.abi,
      functionName: "invoices",
      args: [id],
    });
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
