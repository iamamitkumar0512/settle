// Creates an order, waits for you to pay it, then refunds part of it. It uses every main part of
// the SDK, so it is a quick way to check one works against your Settle.
//
//   SETTLE_BASE_URL=https://<your Settle> SETTLE_KEY_ID=0x... SETTLE_KEY_SECRET=... \
//     pnpm --filter @akhr2405/settle-pay example
//
// If the demo store is set up, it reuses apps/shop/.env and needs no settings at all. Anything
// set in the shell wins over that file.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Settle, { SettleError } from "../src";

const storeSettings = fileURLToPath(new URL("../../../apps/shop/.env", import.meta.url));
if (existsSync(storeSettings) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(storeSettings);
}

const { SETTLE_KEY_ID, SETTLE_KEY_SECRET } = process.env;
const baseUrl = process.env.SETTLE_BASE_URL ?? process.env.SETTLE_URL;
if (!baseUrl || !SETTLE_KEY_ID || !SETTLE_KEY_SECRET) {
  console.error("Set SETTLE_BASE_URL, SETTLE_KEY_ID and SETTLE_KEY_SECRET, or fill in apps/shop/.env.");
  process.exit(1);
}

try {
  const settle = new Settle({
    baseUrl,
    keyId: SETTLE_KEY_ID,
    keySecret: SETTLE_KEY_SECRET,
    businessName: "Chai Point",
  });

  const fees = await settle.fees();
  console.log(`1. Connected to ${baseUrl}. A payment costs ${fees.payment} USDT in network fees.`);

  const order = await settle.orders.create({
    amount: "1.00",
    description: "Masala chai blend",
    receipt: `example-${Date.now()}`,
  });
  console.log(`2. Order ${order.id} created for ${order.amount} USDT. Pay it here:\n   ${order.payUrl}`);

  console.log("3. Waiting up to 10 minutes for the payment…");
  const paid = await settle.orders.waitForPayment(order.id);
  console.log(`4. Paid by ${paid.payer}. Your order number came back: ${paid.receipt}`);

  const refund = await settle.refunds.create({ orderId: order.id, amount: "0.40" });
  console.log(`5. Refunded ${refund.amount} USDT. Proof: ${refund.id}`);

  const after = await settle.orders.fetch(order.id);
  const balance = await settle.account.balance();
  console.log(`6. Order ${after.id} is now "${after.status}", with ${after.refunded} USDT refunded.`);
  console.log(`7. This account holds ${balance.amount} USDT.`);
  console.log("\nEverything worked.");
} catch (error) {
  if (!(error instanceof SettleError)) throw error;
  console.error(`\nStopped: ${error.message} (${error.code})`);
  process.exit(1);
}
