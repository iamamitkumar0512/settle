import type { Address } from "viem";
import { shortAddress } from "./format";

// An invoice as its customer sees it in "To pay".
export type CustomerInvoice = {
  id: string;
  merchantName: string;
  memo: string;
};

// An invoice's saved details as its merchant sees them.
export type InvoiceCustomer = {
  id: string;
  merchantName: string;
  memo: string;
  customerName: string;
  customerEmail: string;
  customerWallet: string;
  // Goes on the end of the pay link, so its holder can open the invoice's PDF.
  linkKey: string;
};

// Who an invoice was sent to, for display: the email, or the wallet address shortened.
export function customerContact(customer: InvoiceCustomer) {
  if (customer.customerEmail) return customer.customerEmail;
  return customer.customerWallet ? shortAddress(customer.customerWallet as Address) : "";
}
