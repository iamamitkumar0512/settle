# Chai Point

A sample store that takes USDT through Settle. It shows what any website does to accept payment:
install [`settle-pay`](../../packages/sdk), add a few lines, and let Settle Checkout do the rest. The
store has no features of its own that Settle lacks. Its orders land in the merchant's Settle app,
where they can be refunded and exported.

All of its Settle code is 22 lines across five files, marked with `#region settle`. The home page
prints those lines from the source files when the site is built.

| File | What it does |
|---|---|
| `lib/settle.ts` | Sets up the SDK with the store's keys. |
| `app/api/orders/route.ts` | Creates an order when a customer clicks Buy. |
| `app/layout.tsx` | Loads `checkout.js`. |
| `components/buy-button.tsx` | Opens checkout. |
| `app/thanks/page.tsx` | Verifies the payment before confirming the order. |

Webhooks are optional and take 6 more lines, in `app/api/webhooks/settle/route.ts`. To turn them on,
add this store's `/api/webhooks/settle` address on Settle's Developers page, and copy the signing
secret into `SETTLE_WEBHOOK_SECRET`.

AI agents can buy here too, in 7 more lines in `app/api/agent/buy/route.ts`. An agent reads
`/api/agent/catalog`, which is free, then pays for its order over x402. See
[`apps/agent`](../agent) for one that does.

## Run it

1. Log in to Settle with the account the store is paid into, and open Developers.
2. Copy `.env.example` to `.env` and fill in the keys and Settle's address.
3. From the repo root:

```bash
pnpm dev:store
```

It runs on port 3100. A new account can hold 5 unpaid orders until its first payment arrives.
