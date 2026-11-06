import "server-only";
import { isAddress, isHex, type Hex } from "viem";
import { isValidCallbackUrl } from "@/lib/checkout";
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
  // Absent on requests from before invoices could be sent to a wallet.
  const customerWallet = (body as Record<string, unknown>).customerWallet ?? "";
  if (
    typeof merchantName !== "string" ||
    typeof customerName !== "string" ||
    typeof customerEmail !== "string" ||
    typeof customerWallet !== "string" ||
    typeof memo !== "string" ||
    typeof salt !== "string" ||
    !isHex(salt) ||
    salt.length !== 66
  ) {
    return null;
  }
  // A store's order adds its own order number and where to send the customer afterwards.
  const { receipt, callbackUrl } = body as Record<string, unknown>;
  if (receipt !== undefined) {
    const isPlain = typeof receipt === "string" && /^[\x20-\x7e]+$/.test(receipt);
    if (!isPlain || receipt.length > INVOICE_LIMITS.receiptBytes) return null;
  }
  if (callbackUrl !== undefined) {
    if (typeof callbackUrl !== "string" || !isValidCallbackUrl(callbackUrl)) return null;
    if (utf8Bytes(callbackUrl) > INVOICE_LIMITS.callbackUrlBytes) return null;
  }

  // At most one of the two says who the invoice is for. An order may leave both empty.
  const customerIsValid = customerWallet
    ? customerEmail === "" && isAddress(customerWallet)
    : customerEmail === "" || isValidEmail(customerEmail);
  if (
    merchantName.trim().length === 0 ||
    !customerIsValid ||
    utf8Bytes(merchantName) > INVOICE_LIMITS.merchantNameBytes ||
    utf8Bytes(customerName) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(customerEmail) > INVOICE_LIMITS.customerFieldBytes ||
    utf8Bytes(memo) > INVOICE_LIMITS.memoBytes
  ) {
    return null;
  }
  return {
    merchantName,
    customerName,
    customerEmail,
    customerWallet,
    memo,
    ...(receipt ? { receipt } : {}),
    ...(callbackUrl ? { callbackUrl } : {}),
    salt,
  };
}
