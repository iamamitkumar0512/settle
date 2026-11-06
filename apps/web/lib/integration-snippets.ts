// The code a store copies. The Developers page fills in the merchant's own key; the public
// guide shows where it goes.
export function serverCode(keyId: string, site: string) {
  return `import Settle from "settle-pay";

const settle = new Settle({
  keyId: ${keyId},
  keySecret: process.env.SETTLE_KEY_SECRET,
  businessName: "Your business",
  baseUrl: "${site}",
});

// Create an order when the customer clicks Buy.
app.post("/orders", async (req, res) => {
  const order = await settle.orders.create({
    amount: "3.00",
    description: "Masala chai blend",
    receipt: "order_42",
  });
  res.json(order);
});

// Confirm the payment before you ship anything.
app.post("/verify", async (req, res) => {
  const payment = await settle.payments.verify(req.body);
  res.json(payment);
});`;
}

export function browserCode(site: string) {
  return `<script src="${site}/checkout.js"></script>
<script>
  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => response.json());

  buyButton.onclick = () =>
    new Settle.Checkout({
      orderId: () => post("/orders").then((order) => order.id),
      handler: (response) => post("/verify", response),
    }).open();
</script>`;
}

export const WEBHOOK_CODE = `// Keep the raw body: the signature covers the exact bytes.
app.post(
  "/webhooks/settle",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const event = settle.webhooks.verify(
      req.body,
      req.headers["x-settle-signature"],
      process.env.SETTLE_WEBHOOK_SECRET,
    );
    if (event.type === "order.paid") fulfil(event.data.receipt);
    res.sendStatus(200);
  },
);`;

export const REFUND_CODE = `// Send part back, or leave out the amount to refund all of it.
await settle.refunds.create({ orderId: order.id, amount: "1.00" });

// No website? A payment link is an invoice with a due date.
const link = await settle.paymentLinks.create({
  amount: "250.00",
  description: "Website hosting, November",
  customer: "ops@acme.example",
});
console.log(link.url);`;

export const AGENT_SERVER_CODE = `// One route, and agents can buy from you. They need no account, no API key and no gas.
export async function POST(request) {
  const { product, quantity, requestId } = await request.json();

  const sale = await settle.agents.charge(request, {
    amount: priceOf(product, quantity),
    description: \`\${quantity} x \${product}\`,
    // The agent's own id for this order, so a retry is never charged twice.
    receipt: \`order-\${requestId}\`,
  });
  // No payment yet: this is the 402 with your price.
  if (!sale.paid) return sale.response;

  return sale.respond({ order: sale.receipt, proof: sale.proofUrl });
}`;

export const AGENT_CLIENT_CODE = `// Any standard x402 client can buy. This is Coinbase's, with a limit on each payment.
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:1874", client: new ExactEvmScheme(account) }],
  spendControls: {
    allowedAssets: [{
      network: "eip155:1874",
      asset: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
      maxAmountPerPayment: "5000000", // 5.00 USDT
    }],
  },
});

await pay("https://your-store.example/api/agent/buy", {
  method: "POST",
  body: JSON.stringify({ product: "masala", quantity: 3, requestId: crypto.randomUUID() }),
});`;
