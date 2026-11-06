import "server-only";
import { isHex, type Hex } from "viem";
import { INVOICE_LIMITS, isValidEmail, type InvoiceDetails } from "@/lib/invoice";

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

// Validates the details a merchant sends for an invoice, plus the salt that hides them in `ref`.
export function parseInvoiceDetails(
  body: unknown,
): (InvoiceDetails & { salt: Hex }) | null {
  if (typeof body !== "object" || body === null) return null;
  const { merchantName, customerName, customerEmail, memo, salt } = body as Record<string, unknown>;
  if (
    typeof merchantName !== "string" ||
    typeof customerName !== "string" ||
    typeof customerEmail !== "string" ||
    typeof memo !== "string" ||
    typeof salt !== "string" ||
    !isHex(salt) ||
    salt.length !== 66
  ) {
    return null;
  }
  if (
    merchantName.trim().length === 0 ||
    !isValidEmail(customerEmail) ||
    utf8Bytes(merchantName) > INVOICE_LIMITS.merchantNameBytes ||
    utf8Bytes(customerName) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(customerEmail) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(memo) > INVOICE_LIMITS.memoBytes
  ) {
    return null;
  }
  return { merchantName, customerName, customerEmail, memo, salt };
}
