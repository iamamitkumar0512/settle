// Creates an invoice and waits for it to be paid.
//   SETTLE_URL=https://<your Settle> MERCHANT_KEY=0x... CUSTOMER=you@example.com pnpm --filter @settle/sdk example
import { privateKeyToAccount } from "viem/accounts";
import { formatUsdt, Settle } from "../src";

const { SETTLE_URL, MERCHANT_KEY, CUSTOMER } = process.env;
if (!SETTLE_URL || !MERCHANT_KEY || !CUSTOMER) {
  console.error("Set SETTLE_URL, MERCHANT_KEY and CUSTOMER.");
  process.exit(1);
}

const settle = new Settle({
  baseUrl: SETTLE_URL,
  account: privateKeyToAccount(MERCHANT_KEY as `0x${string}`),
});

const order = await settle.createInvoice({
  amount: "3.00",
  dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  businessName: "Chai Point",
  customer: CUSTOMER,
  memo: "Masala chai blend",
});
console.log(`Invoice #${order.id} created. Pay it at:\n${order.payUrl}`);

const paid = await settle.waitForPayment(order.id);
console.log(`Paid ${formatUsdt(paid.amount)} USDT by ${paid.payer}.`);
