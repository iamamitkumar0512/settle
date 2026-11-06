import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { REGISTRY_ADDRESS } from "@/lib/contracts";

// A pay link ends in "#k=<key>". Browsers never send that part to a server, so the key stays out
// of logs. Whoever holds the link can open what the invoice's customer can. The key is derived,
// not stored, so the merchant can copy the same link again at any time.
export function payLinkKey(invoiceId: bigint) {
  const secret = process.env.ARKIV_DATA_KEY;
  if (!secret) throw new Error("ARKIV_DATA_KEY is not configured");

  const key = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.alloc(0), "settle-pay-link-v1", 32),
  );
  return createHmac("sha256", key)
    .update(`${REGISTRY_ADDRESS.toLowerCase()}:${invoiceId}`)
    .digest("base64url")
    .slice(0, 22);
}

export function isPayLinkKey(invoiceId: bigint, candidate: unknown) {
  if (typeof candidate !== "string") return false;
  const expected = Buffer.from(payLinkKey(invoiceId));
  const given = Buffer.from(candidate);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
