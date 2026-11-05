# Settle

Settle lets a business get paid in USDT on Whitechain with invoices, pay links, refunds and
subscriptions, and lets the customer pay without holding WBT for gas.

> **Status:** early build for ETHGlobal Mumbai 2026. The invoice contract is live and verified on
> Whitechain Sepolia, and a real USDT invoice has settled. The relayer, web app, SDK and
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
| InvoiceRegistry (verified) | [`0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA`](https://explorer.testnet.whitechain.io/address/0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA) |
| Test USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

### Proof

| Action | Transaction |
|---|---|
| Contract deployment | [`0xe9bae9ae…c8ad08a7`](https://explorer.testnet.whitechain.io/tx/0xe9bae9ae8e2bc42d55f0fd54be64b45f7311f3948ccac91bc1c535cbc8ad08a7) |
| Settled USDT invoice (direct `pay`, 1 USDT) | [`0x0b714b19…57c55065`](https://explorer.testnet.whitechain.io/tx/0x0b714b19f379aaa8677df1381f663006bf95eab8f6371d3ce25b835957c55065) |

## How it works

`InvoiceRegistry` stores invoices and moves USDT when they are paid or refunded. Money goes straight
from customer to merchant inside one transaction, so the contract never holds funds. There is no
owner, pause or upgrade.

- **Direct payment:** the customer approves the contract and calls `pay`.
- **Gasless payment:** the customer signs an EIP-3009 authorization and a relayer submits it to
  `payWithAuthorization`.
- **Refunds:** the merchant calls `refund`, in part or in full, and USDT goes back to the original
  payer.

### Why `receiveWithAuthorization`

A `transferWithAuthorization` signed to the merchant could be submitted by anyone directly to the
USDT contract: the funds would move, but the invoice would never be marked paid.
`receiveWithAuthorization` requires `msg.sender == to`, so the registry is the only valid consumer
of the signature. The authorization's nonce is derived from the invoice and payer, so a signature
can't be replayed or used on another invoice.

## Repo layout

```
contracts/
  src/InvoiceRegistry.sol    invoices, payments, refunds
  src/IUSDT.sol              the USDT functions Settle uses
  test/                      fork tests against the real USDT
  script/Deploy.s.sol        deployment, Whitechain Sepolia only
```

## Running locally

Requires [Foundry](https://getfoundry.sh). The tests fork Whitechain Sepolia and run against the
real USDT, so they need network access.

```bash
cd contracts
forge test
```

## Current limitations

- Testnet only. The contracts have not been audited.
- The relayer, web app, SDK and subscriptions are not built yet, so the gasless path is proven in
  fork tests but has not run on the live chain.
- Refunds depend on the merchant's USDT balance and approval.
- USDT sent directly to the contract by mistake cannot be recovered, because there is no admin.
- A merchant is a single wallet, and a lost key cannot be replaced.
- USDT is the only supported token.

## Tracks

Whitechain Operate and Whitechain Scale.

## License

[MIT](LICENSE)
