import { getAddress, isAddress, type Address } from "viem";

export const SESSION_HOURS = 24;

export type InvoiceCustomer = {
  id: string;
  merchantName: string;
  memo: string;
  customerName: string;
  customerEmail: string;
};

export function signInMessage(merchant: Address, site: string, expiresAt: string) {
  return [
    "Sign in to Settle to view your customer details.",
    "",
    `Merchant: ${merchant}`,
    `Site: ${site}`,
    `Expires: ${expiresAt}`,
  ].join("\n");
}

export function parseSignInMessage(message: string) {
  const match = message.match(/^Merchant: (.+)\nSite: (.+)\nExpires: (.+)$/m);
  if (!match || !isAddress(match[1])) return null;
  const merchant = getAddress(match[1]);
  const [site, expiresAt] = [match[2], match[3]];
  if (message !== signInMessage(merchant, site, expiresAt)) return null;
  return { merchant, site, expiresAt: Date.parse(expiresAt) };
}
