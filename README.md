# Settle

Settle lets a business get paid in USDT on Whitechain with invoices, pay links and refunds, and
lets the customer pay without holding WBT for gas.

<!-- Amit: add the two links, and remove this comment. -->
**Live app:** [ADD DEPLOYED URL] · **Demo video:** [ADD VIDEO LINK]

> **Status:** built for ETHGlobal Mumbai 2026. Both contracts are live and verified on Whitechain
> Sepolia, and invoices have been created, paid and refunded there without the customer or the
> merchant holding gas. Built: email or wallet login, the merchant dashboard, pay page, receipts,
> refunds, CSV export, the relayer, Arkiv records, PDF invoices on Swarm, an SDK and a demo store.
> Subscriptions are built too: plans, a subscribe page, collection of due payments and cancel.
> Reminders are built: in the app for the customer, a Remind button for the merchant and a calendar
> file, with automatic email as an extra that needs an email key. See
> [Current limitations](#current-limitations).

## Why onchain stablecoin settlement on Whitechain

A studio in Mumbai billing a client in Berlin can be paid in USDT in about a second, directly to
its own wallet, with no bank in between. The payment, and any refund back to the same wallet, is a
public record both sides can check. A regular payment rail can't give the customer that record, and
it can't accept a single signature as a payment that someone else submits on the customer's behalf.

USDT on Whitechain supports EIP-3009, so a customer can sign one message and a relayer pays the
gas. We found no hosted paymaster or bundler for Whitechain, which is why Settle uses EIP-3009 with
its own relayer.

## Live on Whitechain Sepolia

| | |
|---|---|
| Chain ID | `1874` |
| InvoiceRegistry (verified) | [`0x4c6F09e112CaF53f2922b382DafD8Aa95826628F`](https://explorer.testnet.whitechain.io/address/0x4c6F09e112CaF53f2922b382DafD8Aa95826628F) |
| GaslessTransfer (verified) | [`0x947a28093aD9Eb1fC5B747383e947CDAc03c0700`](https://explorer.testnet.whitechain.io/address/0x947a28093aD9Eb1fC5B747383e947CDAc03c0700) |
| Subscriptions (verified) | [`0x9dcBde22A2aD70249f188d649236b788DDBd4C61`](https://explorer.testnet.whitechain.io/address/0x9dcBde22A2aD70249f188d649236b788DDBd4C61) |
| First version, replaced | [`0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA`](https://explorer.testnet.whitechain.io/address/0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA) |
| Test USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

### Proof

| Action | Transaction |
|---|---|
| InvoiceRegistry deployment | [`0x02b6cfbd…15388320`](https://explorer.testnet.whitechain.io/tx/0x02b6cfbd5715928eecfd5bd5b8283c9f9c8811cd8803ba840a2ceba615388320) |
| GaslessTransfer deployment | [`0x86e52fbb…a6d2d718`](https://explorer.testnet.whitechain.io/tx/0x86e52fbb3689982c5fbfa2c112e5eefd560304f1ddc3fe6aa045a520a6d2d718) |
| Subscriptions deployment | [`0x7a34c7e6…0a73aaee`](https://explorer.testnet.whitechain.io/tx/0x7a34c7e65536e95e99ca57a7d36ea20b2bf40d668e61ce48ae2de0de0a73aaee) |
| Invoice created without gas (relayed `createFor`) | [`0x9cfc6f6d…e3c416cc`](https://explorer.testnet.whitechain.io/tx/0x9cfc6f6d54b3dbfdc06ffea1b91f6e7639f8c3df856e2c1828d33e15e3c416cc) |
| Gasless USDT payment (relayed `payWithAuthorization`, 1 USDT) | [`0x8c7dfc4c…79e4eeb2`](https://explorer.testnet.whitechain.io/tx/0x8c7dfc4c484dabbb196aea0fa75e8b6dbc214f5d9af850c69200668d79e4eeb2) |
| Refund without gas (relayed `refundWithAuthorization`, 1 USDT) | [`0x51207a48…cac2e890`](https://explorer.testnet.whitechain.io/tx/0x51207a48fa1c1b107655432da9af654e68d09b5b6758a4a255ddfcf6cac2e890) |
| Settled USDT invoice (direct `pay`, 1 USDT, on the first version) | [`0x0b714b19…57c55065`](https://explorer.testnet.whitechain.io/tx/0x0b714b19f379aaa8677df1381f663006bf95eab8f6371d3ce25b835957c55065) |

The payer in the gasless payment, `0x0d99…6aB0`, holds 0 WBT. All three relayed transactions were
sent by the relayer, `0x21dc…836C`.

## Architecture

```
 Merchant or customer                  Settle app (Next.js)
 ┌──────────────────────┐   signs    ┌───────────────────────┐   sends    ┌─────────────────────┐
 │ email login (Privy   │ ─────────▶ │ relay API + relayer   │ ─────────▶ │ Whitechain Sepolia  │
 │ wallet), or a        │            │ wallet                │            │  InvoiceRegistry    │
 │ browser wallet       │            │                       │            │  GaslessTransfer    │
 └──────────────────────┘            │ invoice details ──────┼──▶ Arkiv   │  USDT               │
                                     │ encrypted PDFs ───────┼──▶ Swarm   └─────────────────────┘
 A store's server ─────settle-pay───▶│                       │                       ▲
                                     └───────────────────────┘                       │
        browsers and the SDK read invoices straight from the contract ───────────────┘
```

## How it works

`InvoiceRegistry` stores invoices and moves USDT when they are paid or refunded. Money goes straight
from customer to merchant inside one transaction, so the contract never holds funds. There is no
owner, pause or upgrade.

- **Direct payment:** the customer approves the contract and calls `pay`, with their own gas. The
  merchant receives the whole amount.
- **Gasless payment:** the customer signs an EIP-3009 authorization and a relayer submits it to
  `payWithAuthorization`. The invoice's fee repays the relayer's gas in USDT, out of the merchant's
  amount. A customer with a wallet can choose either way.
- **Gasless create, cancel and refund:** the merchant signs and the relayer submits, so a merchant
  who logs in by email never needs WBT.
- **Refunds:** in part or in full, and USDT goes back to the original payer.

`GaslessTransfer` sends an account's USDT to any address without gas. The sender signs one EIP-3009
authorization and the submitter is paid a fee out of the amount. The recipient and the fee are inside
the signed nonce, so a submitter can change neither. A user who connects their own wallet can pay
the gas themselves instead and skip the fee.

Settle adds no margin. A fee is the gas a relayed call uses, at the live gas price, converted to
USDT with the explorer's WBT price. Creating, cancelling and refunding are relayed for free.

### Why `receiveWithAuthorization`

A `transferWithAuthorization` signed to the merchant could be submitted by anyone directly to the
USDT contract: the funds would move, but the invoice would never be marked paid.
`receiveWithAuthorization` requires `msg.sender == to`, so the registry is the only valid consumer
of the signature. The authorization's nonce is derived from the invoice and payer, so a signature
can't be replayed or used on another invoice.

## Subscriptions

A merchant publishes a plan: an amount and a period. A customer subscribes with two signatures. One
is a USDT permit, which gives the contract an allowance. The other names the plan and caps the
number of payments. The first payment is taken at once. After that anyone can collect a payment
once it is due, so Settle's relayer does, and the customer or the merchant can cancel at any time.

The second signature matters. A permit is only an allowance, so without it, anyone who saw one
could attach it to a plan of their own.

## Reminders

Reminders work with no outside service, so they also reach a customer who was billed to a wallet
address and has no email on file.

- **In the app.** "To pay" in the menu shows how many invoices the account still owes. A banner on
  every page names what is overdue or due within three days, with a button straight to the pay
  page. It reads the due dates from the contract, so nothing is stored for it.
- **From the merchant.** An open invoice has a Remind customer button. It writes the message with
  the invoice's pay link and opens it in the merchant's own mail app, or copies it for any chat.
- **In the customer's calendar.** The pay page has Add to calendar. It downloads a calendar file
  for the due date with an alert the morning before and on the day.
- **By email, optional.** With `RESEND_API_KEY` set, Settle emails the customer once shortly before
  the due date and once after it, and the Remind button can send from Settle too.

## The relayer

**Who pays the gas?** The relayer's wallet pays it in WBT. A relayed payment repays that gas in
USDT out of the invoice, and a relayed transfer repays it out of the amount sent. The fee is the
gas the call uses, at the live gas price, converted with the explorer's WBT price. Creating,
cancelling and refunding are relayed for free.

**Where does its WBT come from?** We fund the wallet from the faucet. `/api/relay/health` shows its
balance, and it stops relaying below 0.005 WBT.

**What stops someone draining it?**

- Every relayed call carries a signature from the wallet whose money or invoice it touches. There
  are no API keys to steal.
- Each call is simulated first, so a bad or reused signature fails before any gas is spent.
- A payment is only relayed if the invoice's fee covers at least half the current gas estimate,
  and invoices under 1 USDT are refused.
- A merchant who has never been paid can keep 5 unpaid invoices. Free actions are capped per
  merchant per day (50 creates, 20 refunds, 20 cancels) and at 500 a day in total.
- 30 requests a minute per address, and nothing is sent when gas is above 50 gwei.

## Invoice details on Arkiv

The contract holds the money and status. Arkiv holds each invoice's business name and description,
plus encrypted customer details that only the merchant can read. It also holds each subscription
plan's name and description. A customer finds their invoices
by the email or wallet address they were sent to. Details are in
[`arkiv/schema.md`](arkiv/schema.md).

- **Network:** Arkiv Rabdi testnet, chain `7794095`
- **Wallet that writes entities:** `0x7d404608B53998044fDDf5d07f6da8092d155278`

### Run a query

You need a free access key from [hub.arkiv.network](https://hub.arkiv.network/access-keys):

```bash
pnpm install
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs
```

This lists the records of the two invoices on the live contract, and any subscription plans. To see sample records from a test
deployment, add its address: `0x0862eb825530db019ed13dbb1a1ef0c6567ba25e`.

The query filters on the writer wallet, because anyone can create entities with the same schema name.

## SDK and demo store

The Settle app is the product: every feature lives there. The SDK is the piece any website adds to
accept payment, and those payments land in the same app.

A store takes USDT through Settle the way it would take cards through a payment gateway. The
server creates an order, [`checkout.js`](apps/web/public/checkout.js) opens Settle Checkout over the
store's page, and the server verifies the payment against the chain.

```js
// server
const settle = new Settle({ keyId, keySecret, businessName: "Chai Point" });
const order = await settle.orders.create({ amount: "3.00", receipt: "order_42" });
const payment = await settle.payments.verify(response);
```

```html
<!-- browser -->
<script src="https://<your Settle>/checkout.js"></script>
<script>
  new Settle.Checkout({ orderId, handler: (response) => confirmOnServer(response) }).open();
</script>
```

[`settle-pay`](packages/sdk) also covers refunds, payment links and withdrawals. Everything it makes
shows in the Settle dashboard for the same account, because both read the same contract. A business
with no website can do all of this from the dashboard instead. Keys are on the app's Developers
page.

[`apps/shop`](apps/shop) is Chai Point, a separate store that shows this working. It has its own
site and its own server, and all of its Settle code is 22 lines, which it prints on its own page.

## PDF invoices on Swarm

A merchant can attach a PDF to an invoice. The server encrypts it, stores it on Swarm, and records
the Swarm reference in a second Arkiv entity. The PDF opens for the merchant, the customer the
invoice was sent to, whoever paid it, and anyone holding the invoice's pay link. Details are in [`arkiv/swarm.md`](arkiv/swarm.md).

## Repo layout

```
contracts/
  src/InvoiceRegistry.sol    invoices, payments, refunds
  src/GaslessTransfer.sol    send USDT without gas, for a fee in USDT
  src/Subscriptions.sol      recurring payments from a USDT permit
  src/IUSDT.sol              the USDT functions Settle uses
  test/                      fork tests against the real USDT
  script/                    deployment, Whitechain Sepolia only
apps/web/                    the Settle app: dashboard, pay pages, API routes, checkout.js
apps/shop/                   Chai Point, a separate demo store built on the SDK
packages/sdk/                settle-pay, the SDK a store installs to take payments
arkiv/                       Arkiv schema, feedback and track notes
```

## Running locally

Requires [Foundry](https://getfoundry.sh). The tests fork Whitechain Sepolia and run against the
real USDT, so they need network access.

```bash
cd contracts
forge test
```

To run the app, copy `apps/web/.env.example` to `apps/web/.env`, fill in its values, then:

```bash
pnpm install
pnpm dev
```

To run the demo store beside it, copy `apps/shop/.env.example` to `apps/shop/.env` and fill in the
keys from the app's Developers page. It runs on port 3100:

```bash
pnpm dev:store
```

To deploy both, see [`DEPLOY.md`](DEPLOY.md).

## Current limitations

- Testnet only. The contracts have not been audited.
- Gasless payment has run on the live chain. Gasless create, cancel, refund and transfer are
  proven in fork tests and in the app against a fork.
- An invoice keeps the fee estimated when it was created, so the relayer can be repaid a little
  more or less than the gas it later spends.
- Nobody has subscribed on the live chain yet. A wallet customer signs twice to subscribe. Due
  payments are collected once a day, or when the merchant collects one from the Plans page.
- Automatic reminder emails need a mail provider's key and are off without one. They have only
  run against a stand-in for that provider. A wallet customer sees the in-app reminder only after
  signing in once, because invoices sent to a wallet are private. Calendar alerts depend on the
  customer's calendar app; Google Calendar replaces them with its own default alert.
- The relayer is one wallet with one send queue, and rate limits are counted in memory. Both
  assume a single running copy of the app.
- Email login has been used on the live chain less than wallet login. A wallet customer sees one
  signature prompt; an email customer sees none.
- An email merchant reveals their Key Secret through the login provider's window. That path has not
  been run end to end yet. The SDK is not on npm until the app has its deployed address.
- A store's order is created on-chain when checkout starts, so an abandoned cart costs the relayer
  gas. It is capped per merchant per day.
- Encrypted customer details are stored on public Arkiv. This uses sample data on testnet and should
  move off Arkiv before real customers use it. See [`arkiv/why-arkiv.md`](arkiv/why-arkiv.md).
- Arkiv records last about 182 days, and nothing renews them yet.
- Refunds depend on the merchant's USDT balance.
- USDT sent directly to the contract by mistake cannot be recovered, because there is no admin.
- A merchant is a single wallet, and a lost key cannot be replaced.
- USDT is the only supported token.

## Tracks

Whitechain Operate, Whitechain Scale, and Arkiv Build on Arkiv (from scratch).

## License

[MIT](LICENSE)
