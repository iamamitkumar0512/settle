// Creates an order, prints its pay link, then confirms the payment once it arrives.
//   SETTLE_URL=https://<your Settle> SETTLE_KEY_ID=0x... SETTLE_KEY_SECRET=... pnpm --filter settle-pay example
import Settle from "../src";

const { SETTLE_URL, SETTLE_KEY_ID, SETTLE_KEY_SECRET } = process.env;
if (!SETTLE_URL || !SETTLE_KEY_ID || !SETTLE_KEY_SECRET) {
  console.error("Set SETTLE_URL, SETTLE_KEY_ID and SETTLE_KEY_SECRET.");
  process.exit(1);
}

const settle = new Settle({
  baseUrl: SETTLE_URL,
  keyId: SETTLE_KEY_ID,
  keySecret: SETTLE_KEY_SECRET,
  businessName: "Chai Point",
});

const order = await settle.orders.create({
  amount: "3.00",
  description: "Masala chai blend",
  receipt: "order_42",
});
console.log(`Order ${order.id} created. Pay it at:\n${order.payUrl}`);

const paid = await settle.orders.waitForPayment(order.id);
console.log(`Paid ${paid.amount} ${paid.currency} by ${paid.payer}.`);
