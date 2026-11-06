import type { Hex } from "viem";
import type { InvoiceDetails } from "./invoice";

export async function saveInvoiceDetails(id: bigint, details: InvoiceDetails, salt: Hex) {
  const response = await fetch(`/api/invoices/${id}/details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...details, salt }),
  });
  return response.ok;
}
