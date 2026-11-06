# settle-pay

Take USDT on Whitechain from your own store, the way you take cards with Razorpay or Stripe. Your
server creates an order, Settle Checkout opens over your page, and your server verifies the
payment. Your customer pays with an email address and needs no wallet and no gas.

The money goes straight from your customer to your account. Settle adds no fee. A small network
fee repays the gas, and it is the same whatever the order's amount.

## Install

```bash
npm install settle-pay
```

Your keys are on the Developers page of your Settle account. The Key Secret can move your money,
like a card gateway's secret key, so keep it on your server and use one Settle account per store.

## Take a payment

**1. On your server, create the order.**

```js
import Settle from "settle-pay";

const settle = new Settle({
  keyId: process.env.SETTLE_KEY_ID,
  keySecret: process.env.SETTLE_KEY_SECRET,
  businessName: "Chai Point",
  baseUrl: "https://<your Settle>", // or set SETTLE_BASE_URL
});

app.post("/orders", async (req, res) => {
  const order = await settle.orders.create({
    amount: "3.00",
    description: "Masala chai blend",
    receipt: "order_42",
    callbackUrl: "https://your-store.example/thanks",
  });
  res.json(order);
});
```

**2. In the browser, open checkout from a click.**

```html
<script src="https://<your Settle>/checkout.js"></script>
<script>
  buy.onclick = () =>
    new Settle.Checkout({
      orderId: () => fetch("/orders", { method: "POST" }).then((r) => r.json()).then((o) => o.id),
      handler: (response) =>
        fetch("/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        }),
      onDismiss: () => showCart(),
    }).open();
</script>
```

`orderId` is an order's id, or a function that creates the order and gives its id. Use the function
when you create the order at the click. Creating one takes seconds, and browsers block a window
opened that long after a click. The function lets the window open at once.

Checkout opens in its own window, so your customer stays on your page. If the window is blocked,
the whole page goes to Settle and comes back to `callbackUrl` with `settle_order_id` and
`settle_payment_id` in the address. `redirect: true` always works this way.

| Option | What it does |
|---|---|
| `orderId` | An order's id, or a function that gives one. Required. |
| `handler(response)` | Runs after payment with `{ settle_order_id, settle_payment_id }`. |
| `onDismiss()` | Runs when the customer closes checkout without paying. |
| `onError(error)` | Runs when `orderId` fails. |
| `redirect` | `true` skips the window and uses the whole page. |

**3. On your server, verify before you fulfil.**

```js
app.post("/verify", async (req, res) => {
  const payment = await settle.payments.verify(req.body);
  fulfil(payment.receipt);
  res.json({ ok: true });
});
```

`verify` reads Whitechain, not Settle. It throws unless the payment exists, paid that order, and the
order is yours. Never trust the browser's word on its own. Also check that the order is the one
this customer is buying, so a paid cheap order can't be reused for a dear one.

The result includes `receiptUrl`, your customer's receipt on Settle. It shows the proof on Whitechain
and any refunds.

## Everything you can call

Results are plain text and numbers, so they go straight into `res.json()`. Amounts are USDT, like
`"3.00"`.

| Call | What it does |
|---|---|
| `orders.create(order)` | Creates an order to pay at checkout. |
| `orders.fetch(id)` | One of your orders, read from the chain. |
| `orders.all()` | All your orders and payment links, newest first. |
| `orders.cancel(id)` | Cancels an order nobody has paid. |
| `orders.waitForPayment(id, options)` | Resolves once it is paid. For scripts. |
| `orders.pay(id)` | Pays any open order from this account. For a script or an agent. |
| `payments.verify(response)` | Confirms a payment. |
| `refunds.create({ orderId, amount })` | Refunds in part, or in full with no `amount`. It comes from your balance, and your customer sees it on their receipt. |
| `paymentLinks.create(link)` | An invoice with a due date and a link to share. No code on your site. |
| `account.balance()` | This account's USDT. |
| `account.withdraw({ to, amount })` | Sends USDT to any address. The network fee comes out of `amount`. |
| `fees()` | Current network fees and the smallest order. |

`orders.create` takes `amount`, and optionally `description`, `receipt`, `callbackUrl`, `customer`,
`customerName` and `businessName`. `customer` is an email or a wallet address: leave it out and
whoever checks out pays. `receipt` is your own order number. Only you can read it, in the dashboard
and the CSV export.

`paymentLinks.create` takes the same fields and a `dueAt` date, and defaults to 7 days.

## Errors

A failed call throws `SettleError`. `message` says what went wrong and `code` is stable, so you can
branch on it.

```js
import { SettleError } from "settle-pay";

try {
  await settle.payments.verify(response);
} catch (error) {
  if (error instanceof SettleError && error.code === "order_not_paid") showRetry();
  else throw error;
}
```

## Fees and limits

- An order paid without gas gives up `order.networkFee` from its amount. If a wallet customer pays
  their own gas, you get the whole amount.
- The smallest order is 1 USDT. See `fees()`.
- An account that has never been paid can hold 5 unpaid orders at a time.
- An account can create 50 orders a day.
- Settle's API allows 30 requests a minute from one address.
- Testnet only: Whitechain Sepolia, chain `1874`.

## Use from CommonJS

```js
const Settle = require("settle-pay");
```

Node 20 or later. The SDK refuses to run in a browser, so your secret can't end up in one.

## Try it

```bash
SETTLE_URL=https://<your Settle> SETTLE_KEY_ID=0x... SETTLE_KEY_SECRET=... pnpm --filter settle-pay example
```

[`apps/shop`](../../apps/shop) is a complete store built on this package, in 22 lines of Settle code.
