import {
  bytesToHex,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { USDT_DECIMALS } from "./contracts";

export const INVOICE_LIMITS = {
  merchantNameBytes: 128,
  customerFieldBytes: 200,
  memoBytes: 500,
} as const;

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// An invoice is sent to an email address or to a wallet address. The other one stays empty.
export type InvoiceDetails = {
  merchantName: string;
  customerName: string;
  customerEmail: string;
  customerWallet: string;
  memo: string;
};

// Reads what a merchant typed as the email or the wallet address it is.
export function parseCustomerContact(text: string) {
  const value = text.trim();
  if (isAddress(value, { strict: false })) {
    return { customerEmail: "", customerWallet: getAddress(value) as string };
  }
  return isValidEmail(value) ? { customerEmail: value, customerWallet: "" } : null;
}

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
  const { merchantName, customerName, customerEmail, customerWallet, memo } = details;
  // An invoice sent to an email hashes exactly as it always has. One sent to a wallet adds it.
  const customer = customerWallet ? { customerEmail, customerWallet } : { customerEmail };
  return keccak256(
    stringToHex(JSON.stringify({ merchantName, customerName, ...customer, memo, salt })),
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
  relayFee: bigint;
};

export type InvoiceState = {
  label: string;
  group: "Open" | "Paid" | "Refunded" | "Cancelled";
  tone: string;
  isOverdue: boolean;
};

export type InvoiceRow = readonly [
  Address,
  Address,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  Hex,
  bigint,
];

export function toInvoice(id: bigint, row: InvoiceRow): Invoice {
  const [merchant, payer, amount, refunded, dueAt, paidAt, status, , relayFee] = row;
  return { id, merchant, payer, amount, refunded, dueAt, paidAt, status, relayFee };
}

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
