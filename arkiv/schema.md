# Settle's Arkiv schema

Settle keeps invoice details in Arkiv. The contract on Whitechain holds the money and the invoice
status. Arkiv holds what the contract doesn't: the business name, the description, and encrypted
customer details.

## Entities

There are three entity types, all defined in
[`apps/web/lib/server/arkiv.ts`](../apps/web/lib/server/arkiv.ts).

### `settle_invoice_v2`: one per invoice

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `registry` | `addr` | Yes | Yes | Which `InvoiceRegistry` deployment the invoice belongs to |
| `invoice_id` | `u64` | Yes | Yes | The on-chain invoice id |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `due_at` | `u64` | Yes | Yes | Due date in unix seconds |
| `customer_lookup` | `str` | Yes | Keyed hash | Finds a customer's invoices without storing a readable email or wallet address. `none` for a store order that names no customer |
| `amount_usdt` | `u256` | No | Yes | Amount in USDT, 6 decimals |
| `merchant_name` | `str` | No | Yes | Business name shown to customers, up to 128 bytes |
| `public_details` | `bytes` | No | Yes | JSON: `{ memo, callbackUrl?, order? }`. `callbackUrl` is where a store wants its customer sent after paying. `order` marks a store's order, which is a cart and not money owed until it is paid |
| `private_details` | `bytes` | No | Encrypted | `{ invoiceId, customerName, customerEmail, customerWallet, receipt?, salt }`. `receipt` is a store's own order number |
| `private_media_type` | `str` | No | Yes | Format of the encrypted data |

### `settle_invoice_file_v1`: one per attached PDF

The PDF itself is on Swarm, encrypted. This entity says where. It is separate from the invoice
record because invoice records are readonly and a PDF can be attached after the invoice exists.
See [`swarm.md`](swarm.md).

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `registry` | `addr` | Yes | Yes | Which `InvoiceRegistry` deployment the invoice belongs to |
| `invoice_id` | `u64` | Yes | Yes | The on-chain invoice id |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `swarm_reference` | `str` | No | Yes | Swarm reference of the encrypted file |
| `media_type` | `str` | No | Yes | What the file is once decrypted: `application/pdf` |
| `size_bytes` | `u64` | No | Yes | Size of the PDF before encryption |
| `encryption` | `str` | No | Yes | How the bytes on Swarm are laid out |

An invoice is sent to an email address or to a wallet address, so one of `customerEmail` and
`customerWallet` is empty. `customer_lookup` is a keyed hash of whichever one is set. A wallet
customer proves the address by signing a message, and an email customer by logging in.

### `settle_plan_v1`: one per subscription plan

A plan is a public offer, so nothing in it is encrypted. The contract holds the amount, the period
and who is subscribed. Arkiv holds what a customer reads before subscribing.

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `contract` | `addr` | Yes | Yes | Which `Subscriptions` deployment the plan belongs to |
| `plan_id` | `u64` | Yes | Yes | The on-chain plan id |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `amount_usdt` | `u256` | No | Yes | Amount per payment in USDT, 6 decimals |
| `period_seconds` | `u64` | No | Yes | Time between payments |
| `merchant_name` | `str` | No | Yes | Business name, up to 128 bytes |
| `plan_name` | `str` | No | Yes | Plan name, up to 128 bytes |
| `public_details` | `bytes` | No | Yes | JSON: `{ description }` |

### `settle_webhook_v1`: one per save of a merchant's webhook settings

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `registry` | `addr` | Yes | Yes | Which `InvoiceRegistry` deployment it belongs to |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `saved_at` | `u64` | Yes | Yes | When it was saved. The newest record wins |
| `private_details` | `bytes` | No | Encrypted | `{ merchant, url, secret }`. An empty `url` means the webhook was removed |
| `private_media_type` | `str` | No | Yes | Format of the encrypted data |

### `settle_webhook_delivery_v1`: one per send of an event

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `registry` | `addr` | Yes | Yes | Which `InvoiceRegistry` deployment it belongs to |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `event_id` | `str` | Yes | Yes | The event. Built from the transaction, so a delivered event isn't sent twice |
| `delivered` | `u64` | Yes | Yes | 1 if the merchant's server accepted it |
| `sent_at` | `u64` | Yes | Yes | When it was sent |
| `event_type` | `str` | No | Yes | `order.paid`, `refund.created` or `webhook.test` |
| `invoice_id` | `u64` | No | Yes | The on-chain invoice id, or 0 for a test event |
| `status_code` | `u64` | No | Yes | What the merchant's server answered, or 0 for no answer |
| `attempts` | `u64` | No | Yes | How many tries it took |

The delivery log holds only what the chain already shows, plus the fact that a delivery was tried.
The address and the secret are never in it.

## Fields we query

| Query | Filters | Used by |
|---|---|---|
| Does this invoice have a record? | `registry`, `invoice_id`, creator | Saving details |
| Public details of one invoice | `registry`, `invoice_id`, creator | Pay page and receipt |
| All of a merchant's invoices | `registry`, `merchant`, creator | Dashboard, invoice page, CSV |
| Invoices sent to one customer | `registry`, `customer_lookup`, creator | Customer invoices page |
| The PDF attached to one invoice | `registry`, `invoice_id`, creator | Pay page, invoice page |
| Does this plan have a record? | `contract`, `plan_id`, creator | Saving plan details |
| Every plan's name and description | `contract`, creator | Plans page, subscribe page, a customer's subscriptions |
| A merchant's business name and store orders | `registry`, `merchant`, creator | New invoice and plan forms, dashboard |
| A merchant's newest webhook settings | `registry`, `merchant`, creator, newest `saved_at` | Developers page, sending webhooks |
| A merchant's recent deliveries | `registry`, `merchant`, creator, newest `sent_at`, limit 20 | Developers page |
| Was this event already delivered? | `registry`, `merchant`, `event_id`, `delivered`, creator | Sending webhooks |

`due_at` is indexed for overdue queries, but the app doesn't query it yet. Overdue status comes from
the contract's due date.

## Who owns them

Each entity is created and owned by Settle's server wallet,
`0x7d404608B53998044fDDf5d07f6da8092d155278`. Merchants don't sign Arkiv writes, so they don't need
Arkiv funds.

Entities are created with `readonly: true`, so nobody can change their contents, including us. The
owner can still extend, transfer or delete them.

Arkiv lets anyone create an entity using the same schema name, so every read filters on our writer
with `.createdBy(...)`. We tested this: filtering on the right creator returned the record, and a
wrong creator returned nothing.

## When they expire

Records use `ExpirationTime.max()`, 7,884,000 blocks. At Rabdi's 2-second blocks, that's about 182
days. Nothing extends them yet, so a record disappears from current reads after that. The invoice and
its payment remain on Whitechain, and the app falls back to showing addresses.

Webhook deliveries are the exception. They use `ExpirationTime.fromDays(7)`, so the log cleans itself
up with no job of ours, and the Developers page says so.

## Example

The live contract, `0x4c6F09e112CaF53f2922b382DafD8Aa95826628F`, has two invoices. Their records:

- Invoice 1: `0x7239a8fe129ad413de36bc4d55e03f72af812bd959ba8089e7e46ff5439ea685`
- Invoice 2: `0x47294a658a8121971796fe77d11263595d71d08fd9663b867c432d1adcfe48f5`

To list them:

```bash
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs
```

A sample plan record from a test deployment of `Subscriptions`,
`0x70e2cc242b49f0f9e46454069f840c038dc87097`:
`0xc3543388318d2c5f4e8cc6b7b8ac78e6a9f434690209b62c7963883ce78d8d6b`. To list it, add both test
addresses:

```bash
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs 0x91d1f1de74761d2892d8434482f8b299f0d38390 0x70e2cc242b49f0f9e46454069f840c038dc87097
```

These sample invoice records belong to another test deployment:

- Registry: `0x0862eb825530db019ed13dbb1a1ef0c6567ba25e`
- Entity key: `0x3a4d720cc8616aea6603a6b2c2c7c179f62c9e83a9c544f8cc3427f4c150189e`

To list them:

```bash
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs 0x0862eb825530db019ed13dbb1a1ef0c6567ba25e
```
