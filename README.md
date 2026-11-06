# Settle

Settle is the payment gateway for USDT on Whitechain. A store adds it to its website the way it
would add a card gateway, and anyone else can create an invoice or a subscription plan in the app.
Either way the customer pays with an email address, and needs no wallet and no gas.

<!-- Amit: add the two links, and remove this comment. -->
**Live app:** [ADD DEPLOYED URL] · **Demo video:** [ADD VIDEO LINK]

> **Status:** built for ETHGlobal Mumbai 2026. All three contracts are live and verified on
> Whitechain Sepolia, and invoices have been created, paid and refunded there without the customer
> or the merchant holding gas. Built: an SDK with Settle Checkout and signed webhooks, a separate
> demo store, email or wallet login, the merchant dashboard, pay page, receipts, refunds,
> subscriptions, reminders, CSV export, the relayer, Arkiv records, PDF invoices on Swarm, and
> sales to AI agents over x402. See [Current limitations](#current-limitations).

## Try it in a few minutes

1. **Buy from a store.** Open the demo store, press Buy and pay with your email address. A new
   account gets free test USDT with one button. You come back to the store with the order confirmed.
2. **Be a merchant.** Open the app, log in with an email, and create an invoice for 5 USDT or less.
   Copy its pay link.
3. **Be the customer.** Open that link in a private window, log in with another email, add test
   USDT and pay. No wallet and no gas.
4. **Refund it.** Back in the first window, open the invoice and refund part of it. The customer's
   receipt shows the refund.

To add Settle to a website of your own, the app's Docs page has the steps.

## How Settle meets each track

| Track asks for | Where it is |
|---|---|
| **Operate:** a drop-in piece a separate demo app adds in about 20 lines | [`settle-pay`](packages/sdk) and [`checkout.js`](apps/web/public/checkout.js). [`apps/shop`](apps/shop) is a separate store with 22 lines of Settle code, printed on its own page |
| **Operate:** both views, merchant and paying customer | The dashboard and the pay page, plus the store and Settle Checkout |
| **Operate:** past the first payment | Refunds in part or in full with a receipt the customer can check, subscriptions that renew and cancel, reminders, a CSV export, signed webhooks |
| **Scale:** a payer flow with no crypto steps | Email login, one button to pay, no wallet, no gas, no network to choose |
| **Scale:** who pays the gas, where the WBT comes from, what stops a drain | [The relayer](#the-relayer) |
| **Scale:** an AI agent pays a business in USDT over x402, with a facilitator you run yourself | [Selling to AI agents](#selling-to-ai-agents) |
| **Arkiv:** a feature users see reads from Arkiv | Business names, customer details, plans, webhook settings and the delivery log. See [`arkiv/`](arkiv) |

## Why onchain stablecoin settlement on Whitechain

A studio in Mumbai billing a client in Berlin can be paid in USDT in about a second, directly to
its own wallet, with no bank in between. The payment, and any refund back to the same wallet, is a
public record both sides can check. A regular payment rail can't give the customer that record, and
it can't accept a single signature as a payment that someone else submits on the customer's behalf.

It also changes what a payment costs and when it is final:

- **A flat fee.** A payment costs a few cents of gas whatever its amount, where a card gateway
  takes a percentage. Settle adds nothing on top.
- **Final in seconds, with no chargebacks.** A refund is the merchant's decision, made in one click.
- **A store can check a payment itself.** The SDK confirms an order by reading the contract, so a
  store doesn't have to trust Settle's word, or keep a shared secret, to know it was paid.
- **Recurring billing the customer controls.** A subscription is an allowance with a cap the
  customer signed, and they can cancel it without asking anyone.
- **A payer with no phone.** An AI agent can't sign up for a card or answer a one-time code, and
  Indian card and UPI payments ask a person for that second factor outside recurring mandates. An
  agent can sign a USDT payment by itself, inside a limit its owner set.

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
| Sale to an AI agent over x402 (agent holds 0 WBT, merchant repays the gas in the same transaction) | [ADD AFTER DEPLOY] |
| Settled USDT invoice (direct `pay`, 1 USDT, on the first version) | [`0x0b714b19…57c55065`](https://explorer.testnet.whitechain.io/tx/0x0b714b19f379aaa8677df1381f663006bf95eab8f6371d3ce25b835957c55065) |

The payer in the gasless payment, `0x0d99…6aB0`, holds 0 WBT. All three relayed transactions were
sent by the relayer, `0x21dc…836C`.

## Architecture

```
 Merchant or customer                  Settle app (Next.js)
 ┌──────────────────────┐   signs    ┌───────────────────────┐   sends    ┌─────────────────────┐
 │ email login (Privy   │ ─────────▶ │ relay API + relayer   │ ─────────▶ │ Whitechain Sepolia  │
 │ wallet), or a        │            │ wallet                │            │  InvoiceRegistry    │
 │ browser wallet       │            │                       │            │  Subscriptions      │
 └──────────────────────┘            │ details, settings ────┼──▶ Arkiv   │  GaslessTransfer    │
                                     │ encrypted PDFs ───────┼──▶ Swarm   │  USDT               │
 A store's website                   │                       │            └─────────────────────┘
 ┌──────────────────────┐ settle-pay │                       │                       ▲
 │ its server           │ ─────────▶ │ orders and refunds    │                       │
 │ its page             │ checkout.js│ Settle Checkout       │                       │
 │ its server           │ ◀───────── │ signed webhooks       │                       │
 └──────────────────────┘            └───────────────────────┘                       │
        browsers and the SDK read payments straight from the contract ───────────────┘
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

- **In the app.** "Payments" in the menu shows how many invoices the account still owes. A banner on
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
- Test money goes only to a logged-in account that has less than the limit, once a day, with a
  daily total. It is sent from the relayer's own test USDT.
- If two copies of the server pick the same transaction number, the later one sends again.

## Invoice details on Arkiv

The contract holds the money and status. Arkiv holds each invoice's business name and description,
plus encrypted customer details that only the merchant can read. It also holds each subscription
plan's name and description, each merchant's encrypted webhook settings, and a delivery log that
Arkiv drops after 7 days. A customer finds their invoices by the email or wallet address they were
sent to. Details are in [`arkiv/schema.md`](arkiv/schema.md).

- **Network:** Arkiv Rabdi testnet, chain `7794095`
- **Wallet that writes entities:** `0x7d404608B53998044fDDf5d07f6da8092d155278`

### Run a query

You need a free access key from [hub.arkiv.network](https://hub.arkiv.network/access-keys):

```bash
pnpm install
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs
```

This lists the invoice records on the live contract, any subscription plans, and recent webhook
deliveries with the days each has left before Arkiv drops it. To see sample records from a test
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

Settle also tells the store's server by signed webhook, even if the customer closes their browser.
Each event is built from the transaction on Whitechain, so nothing a caller says can invent one.
The store's address and secret are set on the app's Developers page, which also shows each delivery
and can resend a failed one.

[`settle-pay`](packages/sdk) also covers refunds, payment links and withdrawals. Everything it makes
shows in the Settle dashboard for the same account, because both read the same contract. A business
with no website can do all of this from the dashboard instead. Keys are on the app's Developers
page.

[`apps/shop`](apps/shop) is Chai Point, a separate store that shows this working. It has its own
site and its own server. It takes a payment in 22 lines of Settle code and gets webhooks in 6 more,
and it prints those lines on its own page.

## Selling to AI agents

Any store on Settle can sell to AI agents by putting a price on one route. Chai Point does it in
[7 lines](apps/shop/app/api/agent/buy/route.ts), and [`apps/agent`](apps/agent) is a cafe's restock
agent that buys from it with nobody watching.

1. The agent calls the store. The SDK answers `402` with the price, in x402's `PAYMENT-REQUIRED`
   header.
2. The agent signs a standard `TransferWithAuthorization` for that price, and repeats the request.
3. The store's SDK signs the gas repayment and passes both to Settle's facilitator, at
   `/api/x402/{verify,settle,supported}`.
4. Settle checks everything and saves the sale on Arkiv.
5. The relayer sends one Multicall3 transaction: the agent pays the merchant, and the merchant
   repays the relayer's gas in USDT. Either both happen or neither does.
6. The order shows under Agent sales, in the CSV, and at the store's webhook as `order.paid`.

**Any x402 agent works.** The agent side is the unmodified `@x402/fetch` client, and `/verify` and
`/supported` answer the standard facilitator client. `/settle` needs one extra thing, the merchant's
signed repayment, which `settle-pay` adds. That is what makes the merchant, not Settle, pay for the
gas.

**Why it doesn't use `InvoiceRegistry`.** A standard x402 signature is a
`TransferWithAuthorization`, which pays the merchant directly. The registry takes a
`receiveWithAuthorization` with a nonce tied to one invoice, so a standard client can't pay it. An
agent's order doesn't need one either: the registry tracks what is created now and paid later, and
this order is created and paid in the same moment. The USDT transfer is the proof.

**What stops a drain.** The relayer spends nothing without the merchant's signature, which also
covers what was sold, so nobody can spend its WBT on a store's behalf or write a fake sale. A dry
run refuses a bad payment before it costs gas. A sale must be above the 1 USDT minimum, and each
merchant has a daily cap.

**What stops paying twice.** The sale is saved before the payment is sent, and the token records
every signature it has used. If the server dies after paying, the agent repeats the request with
the same id and gets its order back with no second charge. This was tested by killing the server
with the payment on-chain.

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
apps/agent/                  a cafe's restock agent, and the check for agent payments
packages/sdk/                settle-pay, the SDK a store installs to take payments
arkiv/                       Arkiv schema, feedback and track notes
```

## Running locally

Requires [Foundry](https://getfoundry.sh). The 132 contract tests fork Whitechain Sepolia and run
against the real USDT, so they need network access. They cover every line of the three contracts.

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

To check every feature by hand, follow [`TESTING.md`](TESTING.md). To deploy both, see
[`DEPLOY.md`](DEPLOY.md).

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
- A sale to an agent pays the merchant directly, so it has no refund button. To refund one, the
  merchant sends the money back from the Account page.
- An agent's limit is per payment. Its total budget is what its wallet holds. A misled agent can
  still make a bad purchase within its limits.
- If two copies of the server handle the same agent order at the same instant, both could settle.
  In one copy, the second is refused. Rate limits and the daily cap are also counted per copy.
- In a rare race, a payment can pass its dry run and fail on-chain. The relayer then loses about
  0.017 USDT of gas with no repayment. The daily cap limits this.
- The test money button stands in for a card or bank payment. It is capped, and only exists on
  testnet.
- A webhook is tried 3 times over a few seconds. After that the merchant resends it by hand. There
  is no webhook for a subscription charge yet.
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
