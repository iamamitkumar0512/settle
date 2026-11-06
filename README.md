# Settle

Settle lets a business get paid in USDT on Whitechain with invoices, pay links and refunds, and
lets the customer pay without holding WBT for gas.

<!-- Amit: add the two links, and remove this comment. -->
**Live app:** [ADD DEPLOYED URL] · **Demo video:** [ADD VIDEO LINK]

> **Status:** built for ETHGlobal Mumbai 2026. Both contracts are live and verified on Whitechain
> Sepolia, and invoices have been created, paid and refunded there without the customer or the
> merchant holding gas. Built: email or wallet login, the merchant dashboard, pay page, receipts,
> refunds, CSV export, the relayer, Arkiv records, PDF invoices on Swarm, an SDK and a demo shop.
> Not built: subscriptions and reminders. See [Current limitations](#current-limitations).

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
| First version, replaced | [`0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA`](https://explorer.testnet.whitechain.io/address/0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA) |
| Test USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

### Proof

| Action | Transaction |
|---|---|
| InvoiceRegistry deployment | [`0x02b6cfbd…15388320`](https://explorer.testnet.whitechain.io/tx/0x02b6cfbd5715928eecfd5bd5b8283c9f9c8811cd8803ba840a2ceba615388320) |
| GaslessTransfer deployment | [`0x86e52fbb…a6d2d718`](https://explorer.testnet.whitechain.io/tx/0x86e52fbb3689982c5fbfa2c112e5eefd560304f1ddc3fe6aa045a520a6d2d718) |
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
 Another app's server ──@settle/sdk─▶│                       │                       ▲
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
plus encrypted customer details that only the merchant can read. A customer finds their invoices
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

This lists the records of the two invoices on the live contract. To see sample records from a test
deployment, add its address: `0x0862eb825530db019ed13dbb1a1ef0c6567ba25e`.

The query filters on the writer wallet, because anyone can create entities with the same schema name.

## SDK and demo shop

[`@settle/sdk`](packages/sdk) lets another app take USDT through Settle. Its server signs with the
merchant's wallet and Settle's relayer submits, so there are no API keys and no gas.

```ts
const order = await settle.createInvoice({ amount: "3.00", dueAt, businessName, customer, memo });
redirect(order.payUrl);
```

The demo shop at `/shop` is built only on the SDK. Its orders show in the Settle dashboard for the
shop's wallet, because both read the same contract.

## PDF invoices on Swarm

A merchant can attach a PDF to an invoice. The server encrypts it, stores it on Swarm, and records
the Swarm reference in a second Arkiv entity. The PDF opens for the merchant, the customer the
invoice was sent to, whoever paid it, and anyone holding the invoice's pay link. Details are in [`arkiv/swarm.md`](arkiv/swarm.md).

## Repo layout

```
contracts/
  src/InvoiceRegistry.sol    invoices, payments, refunds
  src/GaslessTransfer.sol    send USDT without gas, for a fee in USDT
  src/IUSDT.sol              the USDT functions Settle uses
  test/                      fork tests against the real USDT
  script/                    deployment, Whitechain Sepolia only
apps/web/                    Next.js dashboard, pay pages, API routes and the demo shop
packages/sdk/                @settle/sdk, for taking payments from another app
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

To deploy it, see [`DEPLOY.md`](DEPLOY.md).

## Current limitations

- Testnet only. The contracts have not been audited.
- Gasless payment has run on the live chain. Gasless create, cancel, refund and transfer are
  proven in fork tests and in the app against a fork.
- An invoice keeps the fee estimated when it was created, so the relayer can be repaid a little
  more or less than the gas it later spends.
- Subscriptions and reminders are not built yet.
- The relayer is one wallet with one send queue, and rate limits are counted in memory. Both
  assume a single running copy of the app.
- Email login has been used on the live chain less than wallet login. A wallet customer sees one
  signature prompt; an email customer sees none.
- The SDK needs a wallet whose key the merchant holds. A merchant who signed up by email can't use
  it yet.
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
