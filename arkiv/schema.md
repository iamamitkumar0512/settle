# Settle's Arkiv schema

Settle keeps invoice details in Arkiv. The contract on Whitechain holds the money and the invoice
status. Arkiv holds what the contract doesn't: the business name, the description, and encrypted
customer details.

## Entities

There is one entity type today, `settle_invoice_v1`, with one entity per invoice. It's defined in
[`apps/web/lib/server/arkiv.ts`](../apps/web/lib/server/arkiv.ts).

| Column | Type | Indexed | Public | Purpose |
|---|---|---|---|---|
| `registry` | `addr` | Yes | Yes | Which `InvoiceRegistry` deployment the invoice belongs to |
| `invoice_id` | `u64` | Yes | Yes | The on-chain invoice id |
| `merchant` | `addr` | Yes | Yes | The merchant wallet |
| `due_at` | `u64` | Yes | Yes | Due date in unix seconds |
| `amount_usdt` | `u256` | No | Yes | Amount in USDT, 6 decimals |
| `merchant_name` | `str` | No | Yes | Business name shown to customers, up to 128 bytes |
| `public_details` | `bytes` | No | Yes | JSON: `{ memo }` |
| `private_details` | `bytes` | No | Encrypted | `{ invoiceId, customerName, customerEmail, salt }` |
| `private_media_type` | `str` | No | Yes | Format of the encrypted data |

## Fields we query

| Query | Filters | Used by |
|---|---|---|
| Does this invoice have a record? | `registry`, `invoice_id`, creator | Saving details |
| Public details of one invoice | `registry`, `invoice_id`, creator | Pay page and receipt |
| All of a merchant's invoices | `registry`, `merchant`, creator | Dashboard, invoice page, CSV |

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

## Example

These sample records belong to a separate test deployment of the contract:

- Registry: `0x0862eb825530db019ed13dbb1a1ef0c6567ba25e`
- Entity key: `0x87827603be3120a073efaf7ba6b6d351ae203234d22ed0b9003ad904367087d5`

To list them:

```bash
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs 0x0862eb825530db019ed13dbb1a1ef0c6567ba25e
```
