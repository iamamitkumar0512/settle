"use server";

import { SettleError } from "@settle/sdk";
import { redirect } from "next/navigation";
import { PRODUCTS, SHOP_NAME } from "./products";
import { shopSettle } from "./settle";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type CheckoutState = { error?: string };

const MESSAGES: Record<string, string> = {
  invalid_customer: "Enter a valid email or wallet address.",
  open_invoice_limit: "The shop has too many unpaid orders right now. Try again later.",
  too_many_requests: "Too many orders at once. Wait a minute and try again.",
};

// Creates the order as a Settle invoice, then sends the customer to Settle to pay it.
export async function checkout(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const product = PRODUCTS.find(({ id }) => id === form.get("product"));
  const customer = String(form.get("customer") ?? "").trim();
  if (!product) return { error: "Choose something to buy." };
  if (!customer) return { error: "Enter your email or wallet address." };

  const settle = await shopSettle();
  if (!settle) return { error: "The demo shop has no wallet yet. Set SHOP_MERCHANT_PK." };

  let payUrl: string;
  try {
    const order = await settle.createInvoice({
      amount: product.price,
      dueAt: new Date(Date.now() + WEEK_MS),
      businessName: SHOP_NAME,
      customer,
      memo: product.name,
    });
    payUrl = settle.payUrl(order.id, {
      linkKey: order.linkKey,
      returnPath: `/shop/orders/${order.id}`,
    });
  } catch (error) {
    const code = error instanceof SettleError ? error.code : "";
    return { error: MESSAGES[code] ?? "We couldn't start your order. Try again." };
  }
  redirect(payUrl);
}
