import "server-only";
import { createHmac, hkdfSync } from "node:crypto";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function keyedHash(value: string) {
  const secret = process.env.ARKIV_DATA_KEY;
  if (!secret) throw new Error("ARKIV_DATA_KEY is not configured");

  const key = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.alloc(0), "settle-customer-lookup-v1", 32),
  );
  return createHmac("sha256", key).update(value).digest("hex");
}

// A keyed hash, so Arkiv can find a customer's invoices without holding a guessable email hash.
// Two invoices for one customer share this value, which reveals that link but not who it is.
export function customerLookup(email: string) {
  return keyedHash(normalizeEmail(email));
}

// The same for an invoice sent to a wallet address. The prefix keeps the two kinds apart.
export function walletLookup(wallet: string) {
  return keyedHash(`wallet:${wallet.trim().toLowerCase()}`);
}
