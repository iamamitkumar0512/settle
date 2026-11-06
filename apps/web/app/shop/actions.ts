"use server";

import { redirect } from "next/navigation";
import { SettleError } from "settle-pay";
import { PRODUCTS } from "./products";
import { shopSettle } from "./settle";

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
    const order = await settle.orders.create({
      amount: product.price,
      description: product.name,
      customer,
    });
    const url = new URL(order.payUrl);
    url.searchParams.set("return", `/shop/orders/${order.id}`);
    payUrl = url.toString();
  } catch (error) {
    const code = error instanceof SettleError ? error.code : "";
    return { error: MESSAGES[code] ?? "We couldn't start your order. Try again." };
  }
  redirect(payUrl);
}
