import { bytesToHex, keccak256, parseUnits, stringToHex, type Hex } from "viem";
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
