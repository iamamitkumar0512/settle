import {
  bytesToHex,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { USDT_DECIMALS } from "./contracts";

export type InvoiceDetails = {
  customerName: string;
  customerEmail: string;
  memo: string;
};

// Returns null unless the text is a positive USDT amount with at most 6 decimals.
export function parseUsdtAmount(text: string): bigint | null {
  const value = text.replaceAll(",", "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const amount = parseUnits(value, USDT_DECIMALS);
  return amount > 0n ? amount : null;
}

// A due date covers the whole day in the merchant's own timezone.
export function dueDateToUnix(date: string): bigint | null {
  const time = new Date(`${date}T23:59:59`).getTime();
  if (Number.isNaN(time) || time < Date.now()) return null;
  return BigInt(Math.floor(time / 1000));
}

export function newSalt(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

// The on-chain ref. The salt stops anyone guessing an email from this public hash.
export function hashInvoiceDetails(details: InvoiceDetails, salt: Hex): Hex {
  const { customerName, customerEmail, memo } = details;
  return keccak256(
    stringToHex(JSON.stringify({ customerName, customerEmail, memo, salt })),
  );
}

export const InvoiceStatus = {
  Open: 0,
  Paid: 1,
  Refunded: 2,
  Cancelled: 3,
} as const;

export type Invoice = {
  id: bigint;
  merchant: Address;
  payer: Address;
  amount: bigint;
  refunded: bigint;
  dueAt: bigint;
  paidAt: bigint;
  status: number;
};

export type InvoiceState = {
  label: string;
  group: "Open" | "Paid" | "Refunded" | "Cancelled";
  tone: string;
  isOverdue: boolean;
};

const DUE_SOON_SECONDS = 3n * 24n * 60n * 60n;

export function invoiceState(invoice: Invoice, now: bigint): InvoiceState {
  if (invoice.status === InvoiceStatus.Cancelled) {
    return { label: "Cancelled", group: "Cancelled", tone: "", isOverdue: false };
  }
  if (invoice.status === InvoiceStatus.Paid) {
    return { label: "Paid", group: "Paid", tone: "tone-paid", isOverdue: false };
  }
  if (invoice.status === InvoiceStatus.Refunded) {
    const label = invoice.refunded < invoice.amount ? "Partly refunded" : "Refunded";
    return { label, group: "Refunded", tone: "tone-refund", isOverdue: false };
  }
  if (invoice.dueAt < now) {
    return { label: "Overdue", group: "Open", tone: "tone-late", isOverdue: true };
  }
  if (invoice.dueAt - now < DUE_SOON_SECONDS) {
    return { label: "Due soon", group: "Open", tone: "tone-due", isOverdue: false };
  }
  return { label: "Open", group: "Open", tone: "", isOverdue: false };
}
