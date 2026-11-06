# Settle

Settle lets a business get paid in USDT on Whitechain with invoices, pay links, refunds and
subscriptions, and lets the customer pay without holding WBT for gas.

> **Status:** build in progress for ETHGlobal Mumbai 2026. The invoice contract is live and verified on
> Whitechain Sepolia, and a real USDT invoice has settled. The merchant dashboard, pay page, receipts,
> refunds, CSV export and Arkiv records are built. The gasless relayer, email login, SDK and
> subscriptions are still in progress. See [Current limitations](#current-limitations).

## Why onchain stablecoin settlement on Whitechain

A studio in Mumbai billing a client in Berlin can be paid in USDT in about a second, directly to
its own wallet, with no bank in between. The payment, and any refund back to the same wallet, is a
public record both sides can check. A regular payment rail can't give the customer that record, and
it can't accept a single signature as a payment that someone else submits on the customer's behalf.

USDT on Whitechain supports EIP-3009, so a customer can sign one message and a relayer pays the
gas. Whitechain has no paymaster or account abstraction service, which is why Settle uses EIP-3009
with its own relayer.

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
| Settled USDT invoice (direct `pay`, 1 USDT, on the first version) | [`0x0b714b19…57c55065`](https://explorer.testnet.whitechain.io/tx/0x0b714b19f379aaa8677df1381f663006bf95eab8f6371d3ce25b835957c55065) |

## How it works

`InvoiceRegistry` stores invoices and moves USDT when they are paid or refunded. Money goes straight
from customer to merchant inside one transaction, so the contract never holds funds. There is no
owner, pause or upgrade.

- **Direct payment:** the customer approves the contract and calls `pay`.
- **Gasless payment:** the customer signs an EIP-3009 authorization and a relayer submits it to
  `payWithAuthorization`. The relayer earns the invoice's fee in USDT, out of the merchant's amount.
- **Gasless create, cancel and refund:** the merchant signs and the relayer submits, so a merchant
  who logs in by email never needs WBT.
- **Refunds:** in part or in full, and USDT goes back to the original payer.

`GaslessTransfer` sends an account's USDT to any address without gas. The sender signs one EIP-3009
authorization and the submitter is paid a fee out of the amount. The recipient and the fee are inside
the signed nonce, so a submitter can change neither. A user who connects their own wallet can pay
the gas themselves instead and skip the fee.

### Why `receiveWithAuthorization`

A `transferWithAuthorization` signed to the merchant could be submitted by anyone directly to the
USDT contract: the funds would move, but the invoice would never be marked paid.
`receiveWithAuthorization` requires `msg.sender == to`, so the registry is the only valid consumer
of the signature. The authorization's nonce is derived from the invoice and payer, so a signature
can't be replayed or used on another invoice.

## Invoice details on Arkiv

The contract holds the money and status. Arkiv holds each invoice's business name and description,
plus encrypted customer details that only the signed-in merchant can read. Details are in
[`arkiv/schema.md`](arkiv/schema.md).

- **Network:** Arkiv Rabdi testnet, chain `7794095`
- **Wallet that writes entities:** `0x7d404608B53998044fDDf5d07f6da8092d155278`

### Run a query

You need a free access key from [hub.arkiv.network](https://hub.arkiv.network/access-keys):

```bash
pnpm install
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs
```

This lists invoice records for the live contract. To see the sample records from the test deployment,
add its address: `0x0862eb825530db019ed13dbb1a1ef0c6567ba25e`.

The query filters on the writer wallet, because anyone can create entities with the same schema name.

## PDF invoices on Swarm

A merchant can attach a PDF to an invoice. The server encrypts it, stores it on Swarm, and records
the Swarm reference in a second Arkiv entity. Only the merchant, the customer the invoice was sent
to, and whoever paid it can open the PDF. Details are in [`arkiv/swarm.md`](arkiv/swarm.md).

## Repo layout

```
contracts/
  src/InvoiceRegistry.sol    invoices, payments, refunds
  src/GaslessTransfer.sol    send USDT without gas, for a fee in USDT
  src/IUSDT.sol              the USDT functions Settle uses
  test/                      fork tests against the real USDT
  script/                    deployment, Whitechain Sepolia only
apps/web/                    Next.js dashboard, pay pages and API routes
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

## Current limitations

- Testnet only. The contracts have not been audited.
- The gasless paths are proven in fork tests and in the app against a fork, but have not run on the
  live chain yet.
- The SDK, subscriptions and reminders are not built yet.
- A customer who pays from a wallet can open an invoice's PDF only after paying.
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
