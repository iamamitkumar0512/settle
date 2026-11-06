import type { RelayResult } from "./relay-client";
import type { Credentials } from "./use-session";

export const MAX_PDF_BYTES = 2 * 1024 * 1024;

// Returns what is wrong with a chosen file, or nothing when it can be uploaded.
export function pdfProblem(file: File) {
  if (file.type !== "application/pdf") return "Choose a PDF file.";
  if (file.size === 0 || file.size > MAX_PDF_BYTES) return "The PDF must be 2 MB or smaller.";
  return undefined;
}

const MESSAGES: Record<string, string> = {
  pdf_not_configured: "PDF invoices aren't set up yet.",
  pdf_too_large: "The PDF must be 2 MB or smaller.",
  not_a_pdf: "That file isn't a PDF.",
  pdf_already_attached: "This invoice already has a PDF.",
  not_your_invoice: "Only the business that created this invoice can attach a PDF.",
  not_allowed: "Only the business and the customer this invoice was sent to can open its PDF.",
  no_pdf: "This invoice has no PDF.",
  log_in_again: "Your session ended. Log in again.",
  too_many_requests: "Too many requests. Wait a little and try again.",
};

export function pdfErrorMessage(code: string) {
  return MESSAGES[code] ?? "That didn't work. Try again.";
}

async function errorCode(response: Response) {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" ? data.error : "failed";
}

// Sends the PDF to the server, which encrypts it, stores it on Swarm and records it on Arkiv.
export async function attachInvoicePdf(
  id: bigint,
  file: File,
  credentials: Credentials,
): Promise<RelayResult> {
  const form = new FormData();
  form.set("credentials", JSON.stringify(credentials));
  form.set("file", file);
  try {
    const response = await fetch(`/api/invoices/${id}/pdf`, { method: "PUT", body: form });
    if (!response.ok) return { ok: false, error: await errorCode(response) };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, error: "network" };
  }
}

// Either one is enough: the key from the pay link, or a login that is allowed to open the PDF.
export async function fetchInvoicePdf(
  id: bigint,
  access: { linkKey?: string; credentials?: Credentials },
): Promise<{ ok: true; pdf: Blob } | { ok: false; error: string }> {
  try {
    const response = await fetch(`/api/invoices/${id}/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(access),
    });
    if (!response.ok) return { ok: false, error: await errorCode(response) };
    return { ok: true, pdf: await response.blob() };
  } catch {
    return { ok: false, error: "network" };
  }
}
