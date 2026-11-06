import { zeroAddress, type Address } from "viem";
import type { Invoice } from "@/lib/invoice";
import { MAX_PDF_BYTES } from "@/lib/invoice-pdf";
import { readCustomerInvoices, readInvoiceFile, writeInvoiceFile } from "@/lib/server/arkiv";
import { authenticate } from "@/lib/server/auth";
import { decryptInvoiceFile, encryptInvoiceFile } from "@/lib/server/invoice-file";
import { isPayLinkKey } from "@/lib/server/pay-link";
import type { VerifiedAccount } from "@/lib/server/privy-identity";
import { allow, HOUR } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/relay-http";
import { readInvoice, RelayError } from "@/lib/server/relayer";
import { downloadFromSwarm, swarmConfigured, uploadToSwarm } from "@/lib/server/swarm";

export const maxDuration = 60;

const UPLOADS_PER_HOUR = 20;
const DOWNLOADS_PER_HOUR = 120;
const PDF_HEADER = "%PDF-";

type Context = RouteContext<"/api/invoices/[id]/pdf">;

// One upload per invoice at a time, so two requests can't both write a record.
const uploading = new Set<string>();

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

async function invoiceId(context: Context) {
  const { id } = await context.params;
  return /^[1-9]\d{0,18}$/.test(id) ? BigInt(id) : null;
}

function holds(account: VerifiedAccount, wallet: Address) {
  return account.wallets.some((own) => own.toLowerCase() === wallet.toLowerCase());
}

// The PDF can name the customer, so a logged-in account opens it only as the business, as
// whoever paid, or as the customer the invoice was sent to.
async function mayOpen(account: VerifiedAccount, invoice: Invoice) {
  if (holds(account, invoice.merchant)) return true;
  if (invoice.payer !== zeroAddress && holds(account, invoice.payer)) return true;
  const customers = [
    ...account.emails.map((email) => ({ email })),
    ...account.wallets.map((wallet) => ({ wallet })),
  ];
  for (const customer of customers) {
    const billed = await readCustomerInvoices(customer);
    if (billed.some((row) => row.id === String(invoice.id))) return true;
  }
  return false;
}

function failure(error: unknown, what: string) {
  if (error instanceof RelayError) return fail(error.status, error.code);
  // The name only: messages can contain a keyed RPC URL.
  console.error(`${what} failed:`, error instanceof Error ? error.name : "unknown");
  return fail(502, "failed");
}

// Attaches a PDF to an invoice. It is encrypted here, stored on Swarm, and its reference is
// recorded on Arkiv. Only the invoice's merchant can attach one, and only once.
export async function PUT(request: Request, context: Context) {
  const id = await invoiceId(context);
  if (id === null) return fail(400, "invalid_request");
  if (!swarmConfigured()) return fail(503, "pdf_not_configured");
  if (!allow(`pdf-upload:${clientIp(request)}`, UPLOADS_PER_HOUR, HOUR)) {
    return fail(429, "too_many_requests");
  }
  // Refuse an oversized body before reading it. The form adds a little around the file.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PDF_BYTES + 64_000) {
    return fail(413, "pdf_too_large");
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const credentials = form?.get("credentials");
  if (!(file instanceof File) || typeof credentials !== "string") {
    return fail(400, "invalid_request");
  }
  if (file.size === 0 || file.size > MAX_PDF_BYTES) return fail(413, "pdf_too_large");
  const pdf = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(pdf.subarray(0, PDF_HEADER.length)) !== PDF_HEADER) {
    return fail(400, "not_a_pdf");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(credentials);
  } catch {
    // Falls through to the failed login below.
  }
  const account = await authenticate(parsed, request.headers.get("host"));
  if (!account) return fail(401, "log_in_again");

  const key = String(id);
  if (uploading.has(key)) return fail(409, "pdf_already_attached");
  uploading.add(key);
  try {
    const { invoice } = await readInvoice(id);
    if (!holds(account, invoice.merchant)) return fail(403, "not_your_invoice");
    if (await readInvoiceFile(id)) return fail(409, "pdf_already_attached");

    const reference = await uploadToSwarm(encryptInvoiceFile(id, pdf));
    const { entityKey, txHash } = await writeInvoiceFile({
      id,
      merchant: invoice.merchant,
      reference,
      size: pdf.length,
    });
    return Response.json({ reference, entityKey, txHash });
  } catch (error) {
    return failure(error, "Attaching a PDF");
  } finally {
    uploading.delete(key);
  }
}

// Returns the decrypted PDF to whoever holds the invoice's pay link, or to a logged-in account
// that is allowed to open it.
export async function POST(request: Request, context: Context) {
  const id = await invoiceId(context);
  if (id === null) return fail(400, "invalid_request");
  if (!allow(`pdf-download:${clientIp(request)}`, DOWNLOADS_PER_HOUR, HOUR)) {
    return fail(429, "too_many_requests");
  }

  const body = (await request.json().catch(() => null)) as {
    credentials?: unknown;
    linkKey?: unknown;
  } | null;
  const hasLink = isPayLinkKey(id, body?.linkKey);
  const account = hasLink
    ? null
    : await authenticate(body?.credentials, request.headers.get("host"));
  if (!hasLink && !account) return fail(401, "log_in_again");

  try {
    const { invoice } = await readInvoice(id);
    if (account && !(await mayOpen(account, invoice))) return fail(403, "not_allowed");
    const file = await readInvoiceFile(id);
    if (!file) return fail(404, "no_pdf");

    const pdf = decryptInvoiceFile(id, await downloadFromSwarm(file.reference));
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error, "Opening a PDF");
  }
}
