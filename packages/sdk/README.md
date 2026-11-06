# @settle/sdk

Take USDT payments on Whitechain from your own app. Your server creates an invoice, sends the
customer to Settle's pay page, and reads the payment from the contract.

Your wallet signs each request and Settle's relayer submits it, so the wallet never needs gas.
There are no API keys: the signature is the authorization.

## Quick start

```ts
import { Settle } from "@settle/sdk";
import { privateKeyToAccount } from "viem/accounts";

const settle = new Settle({
  baseUrl: "https://<your Settle>",
  account: privateKeyToAccount(process.env.MERCHANT_KEY),
});

// Checkout: create the order and send the customer to pay.
const order = await settle.createInvoice({
  amount: "3.00",
  dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  businessName: "Chai Point",
  customer: "priya@example.com", // or a wallet address
  memo: "Masala chai blend",
});
redirect(order.payUrl);

// Later: read the payment from the contract.
const invoice = await settle.getInvoice(order.id);
if (invoice.status === "paid") confirmOrder();
```

Use it on a server. The wallet's key must never reach a browser.

## What you can call

| Call | What it does | Signs |
|---|---|---|
| `createInvoice(invoice)` | Creates an invoice. Returns its id and `payUrl`. | Yes |
| `payUrl(id, options)` | The pay page for an invoice, with an optional way back to your site. | No |
| `getInvoice(id)` | Reads an invoice from the contract. | No |
| `getInvoiceDetails(id)` | The business name and description saved with it. | No |
| `listInvoices(merchant?)` | Every invoice of a merchant, newest first. | No |
| `waitForPayment(id, options)` | Resolves when the invoice is paid. | No |
| `refund(id, amount)` | Sends USDT back to whoever paid, in part or in full. | Yes |
| `cancel(id)` | Cancels an unpaid invoice. | Yes |
| `withdraw(to, amount)` | Sends the wallet's USDT to any address. | Yes |
| `pay(id)` | Pays an invoice from the wallet. Useful for a script or an agent. | Yes |
| `balance(address?)` | A wallet's USDT balance. | No |
| `quote()` | The current network fees. | No |

Amounts go in as text (`"12.50"`) or base units (`12_500_000n`) and come back as base units.
`formatUsdt` and `parseUsdt` convert between them.

A failed call throws `SettleError`. Its `code` is Settle's reason, such as `InvoiceNotOpen`,
`RefundTooLarge` or `open_invoice_limit`.

## Fees

Settle adds no fee of its own. A network fee only repays the gas the relayer spends:

- An invoice paid without gas gives up `invoice.networkFee` from its amount.
- `withdraw` takes the fee from the amount sent.
- Creating, cancelling and refunding are free.

## The Settle dashboard

Invoices made with the SDK are ordinary Settle invoices. Log in to Settle with the same wallet to
see them, refund them, export them and withdraw.

A merchant who signed up to Settle by email has no key to give a server, so the SDK needs a
wallet you hold the key for.

## Limits

- Settle allows a wallet that has never been paid 5 unpaid invoices at a time.
- The relay API allows 30 requests a minute from one address.
- `payUrl`'s `returnPath` only works for a page on the same site as Settle.
- Testnet only: Whitechain Sepolia, chain `1874`.

## Try it

```bash
SETTLE_URL=https://<your Settle> MERCHANT_KEY=0x... CUSTOMER=you@example.com pnpm --filter @settle/sdk example
```

The demo shop in [`apps/web/app/shop`](../../apps/web/app/shop) is a complete integration.
