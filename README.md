# Settle

> The payment gateway for USDT on Whitechain. A store adds it in about 20 lines, and its customer
> pays with an email address: no wallet, no gas, nothing to install.

[![npm](https://img.shields.io/npm/v/@akhr2405/settle-pay?label=npm)](https://www.npmjs.com/package/@akhr2405/settle-pay)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-363636?logo=solidity)](contracts/src)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-FFDB1C.svg)](https://getfoundry.sh)

**[Live app](https://settle-usdt.vercel.app)** · **[Demo store](https://chai-point-store.vercel.app)** ·
**[Docs](https://settle-usdt.vercel.app/docs)** · **Demo video:** [ADD VIDEO LINK]

Built for ETHGlobal Mumbai 2026. Live on Whitechain Sepolia and Arkiv's Rabdi testnet.

## Overview

Cards take a percentage and settle in days. Crypto payments ask the customer for a wallet and gas.
Settle removes both problems. A merchant gets USDT in their own account in seconds, and the customer
only needs an email address.

There are three ways to get paid:

- **On a website:** install the SDK, create an order and open Settle Checkout, the way you would add
  a card gateway.
- **With a link:** create an invoice or a subscription plan in the app, and share the link.
- **From AI agents:** put a price on one route, and an agent can buy over x402 with no account, no
  API key and no gas.

Every payment lands in one dashboard, with refunds, subscriptions, reminders, receipts, webhooks and
a CSV export. Settle adds no fee of its own.

## Example: a 3.00 USDT order

| Step | What happens | Money |
|---|---|---|
| 1 | The store's server creates the order with the SDK | Nothing moves |
| 2 | The customer clicks Buy and logs in with their email | Nothing moves |
| 3 | They click Pay, which signs one message | Free for them |
| 4 | Settle's relayer sends the transaction | Relayer pays 0.00075 WBT in gas |
| 5 | The contract settles it in one transaction | Store gets 2.945, relayer gets 0.055 USDT |
| 6 | The store verifies on-chain, and gets a webhook | Order confirmed in seconds |

The fee only repays the gas, so it stays about 0.055 USDT on any amount. On a 1,000 sale, a card
gateway at 3% takes about 30.

## Add it to a website

```bash
npm install @akhr2405/settle-pay
```

```js
// On your server
import Settle from "@akhr2405/settle-pay";

const settle = new Settle({
  keyId: process.env.SETTLE_KEY_ID,
  keySecret: process.env.SETTLE_KEY_SECRET,
  businessName: "Chai Point",
});

const order = await settle.orders.create({ amount: "3.00", receipt: "order_42" });
const payment = await settle.payments.verify(response); // reads the chain, not Settle
```

```html
<!-- In your page -->
<script src="https://settle-usdt.vercel.app/checkout.js"></script>
<script>
  new Settle.Checkout({ orderId, handler: (response) => confirmOnServer(response) }).open();
</script>
```

Keys are on the app's Developers page. [`apps/shop`](apps/shop) is Chai Point, a separate store that
installs the package from npm and takes payment in 22 lines, printed on its own page. The
[SDK guide](packages/sdk) covers refunds, payment links, webhooks and agents.

## How it works

```
Customer signs once ──▶ Store: SDK + checkout.js ──▶ Settle app + relayer ──▶ Whitechain contracts
                                                       ├── details ──▶ Arkiv
                                                       └── PDFs ─────▶ Swarm
```

| Piece | What it does |
|---|---|
| [`InvoiceRegistry`](contracts/src/InvoiceRegistry.sol) | Invoices, gasless payments and refunds. It holds no funds and has no owner |
| [`Subscriptions`](contracts/src/Subscriptions.sol) | Recurring payments from one signed allowance, capped by the customer |
| [`GaslessTransfer`](contracts/src/GaslessTransfer.sol) | Sends USDT with no gas, for withdrawals |
| [`apps/web`](apps/web) | The app, the relayer, the x402 facilitator and `checkout.js` |
| [`packages/sdk`](packages/sdk) | `@akhr2405/settle-pay`, the piece a store installs |
| [`apps/agent`](apps/agent) | A cafe's restock agent, run by Gemini, that buys with nobody watching |

Gasless works because USDT on Whitechain supports EIP-3009: a customer signs one message, and anyone
can submit it. We use `receiveWithAuthorization`, so only our contract can use the signature, and its
nonce is tied to one invoice and one payer.

### Who pays the gas?

- **Who pays:** the relayer's wallet pays in WBT, and the contract repays it in USDT from the
  merchant's share. Settle adds no margin. Creating, cancelling and refunding are relayed for free.
- **Where the WBT comes from:** we fund the wallet from the faucet. `/api/relay/health` shows its
  balance, and it stops below 0.005 WBT.
- **What stops a drain:** every call needs a signature from the wallet it touches, and each one is
  simulated first, so a bad signature costs nothing. Free actions have daily caps, and a merchant
  who has never been paid can keep 5 unpaid invoices.

The relayer can't change an amount or redirect money, because the signature fixes both. If it stopped,
customers with WBT could still pay directly.

### Selling to AI agents

The store answers `402` with its price, and the agent signs a standard x402 payment with no WBT. The
relayer sends one Multicall3 transaction in which the agent pays the store and the store repays the
gas, so both happen or neither does. Any standard x402 client works, because Settle runs its own
facilitator at `/api/x402/{verify,settle,supported}`. A retry with the same id is never charged twice,
which we tested by killing the server with the payment on-chain.

### Data on Arkiv and Swarm

Whitechain holds the money. Arkiv holds what people read: business names, descriptions, encrypted
customer details, plans, webhook settings and agent sales. PDFs are encrypted, stored on Swarm, and
found through an Arkiv record.

- **Network:** Arkiv Rabdi testnet, chain `7794095`
- **Wallet that writes entities:** `0x7d404608B53998044fDDf5d07f6da8092d155278`

Get a free key at [hub.arkiv.network](https://hub.arkiv.network/access-keys), then run a query:

```bash
pnpm install
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs
```

It lists the live records. Every read filters on the wallet above, because anyone can create entities
with the same schema name. See [`arkiv/`](arkiv) for the [schema](arkiv/schema.md),
[why Arkiv](arkiv/why-arkiv.md), [how we use it](arkiv/how-you-use-arkiv.md), [Swarm](arkiv/swarm.md),
[reach](arkiv/reach.md) and [friction](arkiv/friction.md).

## Tracks

| Track asks for | Where it is |
|---|---|
| **Operate:** a drop-in piece, added in about 20 lines by a separate demo app | [`@akhr2405/settle-pay`](packages/sdk), [`checkout.js`](apps/web/public/checkout.js) and [`apps/shop`](apps/shop) |
| **Operate:** both views, merchant and paying customer | The dashboard and the pay page |
| **Operate:** past the first payment | Refunds, subscriptions, reminders, CSV export, signed webhooks |
| **Scale:** a payer flow with no crypto steps | Email login, one button to pay, no wallet, no gas |
| **Scale:** who pays the gas, and what stops a drain | [Who pays the gas?](#who-pays-the-gas) |
| **Scale:** an AI agent pays in USDT over x402, with your own facilitator | [Selling to AI agents](#selling-to-ai-agents) |
| **Arkiv + Swarm:** features users see read from Arkiv, with files on Swarm | [Data on Arkiv and Swarm](#data-on-arkiv-and-swarm) |

## Live on Whitechain Sepolia

| Contract (verified) | Address |
|---|---|
| InvoiceRegistry | [`0x4c6F09e112CaF53f2922b382DafD8Aa95826628F`](https://explorer.testnet.whitechain.io/address/0x4c6F09e112CaF53f2922b382DafD8Aa95826628F) |
| GaslessTransfer | [`0x947a28093aD9Eb1fC5B747383e947CDAc03c0700`](https://explorer.testnet.whitechain.io/address/0x947a28093aD9Eb1fC5B747383e947CDAc03c0700) |
| Subscriptions | [`0x9dcBde22A2aD70249f188d649236b788DDBd4C61`](https://explorer.testnet.whitechain.io/address/0x9dcBde22A2aD70249f188d649236b788DDBd4C61) |
| Test USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

Proof on the live chain. The payers hold 0 WBT, and the relayer `0x21dc…836C` sent each one.

| Action | Transaction |
|---|---|
| Gasless payment | [`0x8c7dfc4c…79e4eeb2`](https://explorer.testnet.whitechain.io/tx/0x8c7dfc4c484dabbb196aea0fa75e8b6dbc214f5d9af850c69200668d79e4eeb2) |
| Gasless refund | [`0x51207a48…cac2e890`](https://explorer.testnet.whitechain.io/tx/0x51207a48fa1c1b107655432da9af654e68d09b5b6758a4a255ddfcf6cac2e890) |
| Store order through hosted checkout | [`0x5b21cefc…f8f3161a`](https://explorer.testnet.whitechain.io/tx/0x5b21cefc2ca09f6a17351bd157469b31aa0afb8d0c73700277fd0466f8f3161a) |
| Sale to a Gemini agent over x402, 3 USDT | [`0x27f6804c…9a45ba23`](https://explorer.testnet.whitechain.io/tx/0x27f6804c3b42eccba84d0c4c527777b1bd15f40529b77eb00fb42be19a45ba23) |
| Subscription started | [`0xad3a9d66…e6b4cfec`](https://explorer.testnet.whitechain.io/tx/0xad3a9d66265884cb5958cd2ebf615914dc4e18035e5a18bd4e08c9aae6b4cfec) |
| Renewal collected by itself | [`0x062555b3…6ba4d4a2`](https://explorer.testnet.whitechain.io/tx/0x062555b35375e48219a18300d7285213640f23e6b7ad74fc1eccbbac6ba4d4a2) |
| Subscription cancelled | [`0x3603ecd6…68a59f71`](https://explorer.testnet.whitechain.io/tx/0x3603ecd651156679f12eb962545ef377ccfe183e9c0760a22331cb4c68a59f71) |
| Gasless withdrawal | [`0xbc6b25cc…85969bb7`](https://explorer.testnet.whitechain.io/tx/0xbc6b25cc4bfff0d70079958b5cb13bef507752abd67bc61b6a9ee76e85969bb7) |

## Testing

The 132 contract tests fork Whitechain Sepolia and run against the real USDT, not a mock. They cover
every line of the three contracts.

```bash
cd contracts && forge test
```

The app, SDK, checkout, webhooks and agent payments were also tested end to end on a fork with a
scripted wallet in a real browser, including a server killed after paying, fake messages and failing
webhooks. On the live sites, the agent check passed all 20, a Gemini agent placed a real order by
itself, a store order went through checkout, and a reminder email reached its inbox. Email login was
tested by hand.

## Run it locally

Copy `apps/web/.env.example` to `apps/web/.env` and fill it in, then:

```bash
pnpm install
pnpm dev         # the app
pnpm dev:store   # the demo store, on port 3100
```

The agent has its own steps in [`apps/agent`](apps/agent). Whitechain feedback is in
[`WHITECHAIN_FEEDBACK.md`](WHITECHAIN_FEEDBACK.md).

## Current limitations

- Testnet only, and the contracts have not been audited.
- A store's Key Secret controls that account's money and can't be rotated, so each store needs its
  own account.
- The relayer is one wallet, and rate limits are counted in memory, so both assume one running copy.
- Encrypted customer details sit on public Arkiv. This is sample data, and it should move off Arkiv
  before real customers use it. See [`arkiv/why-arkiv.md`](arkiv/why-arkiv.md).
- Arkiv records last about 182 days and nothing renews them yet. PDFs rely on Swarm's public gateway.
- A webhook is tried 3 times, then resent by hand. Subscription payments don't send one yet.
- A sale to an agent has no refund button, so the merchant sends the money back from Account.

## License

[MIT](LICENSE)
