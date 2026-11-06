import "server-only";
import { registry } from "@/lib/contracts";
import { InvoiceStatus, toInvoice } from "@/lib/invoice";
import { chainClient } from "./relayer";

// Every invoice that hasn't been paid or cancelled, read in one multicall.
export async function readOpenInvoices() {
  const next = await chainClient.readContract({ ...registry, functionName: "nextId" });
  const ids = Array.from({ length: Number(next) - 1 }, (_, index) => BigInt(index + 1));
  if (ids.length === 0) return [];

  const rows = await chainClient.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...registry, functionName: "invoices", args: [id] }) as const),
  });
  return rows
    .map((row, index) => toInvoice(ids[index], row))
    .filter((invoice) => invoice.status === InvoiceStatus.Open);
}
