# How Settle uses Arkiv

## Do filters, edit rights and expiry fit what the app does?

**Filters.** The app asks three questions: "what are this invoice's details?", "what are this
merchant's invoices?" and "which invoices were sent to this customer?" So `registry`, `invoice_id`,
`merchant` and `customer_lookup` are indexed. Encrypted columns can't be filtered, which is why the
customer lookup is a separate keyed hash. `due_at` is indexed but not used yet.

**Who can edit.** Nobody. An invoice is a document, and changing it after a customer has seen it would
break trust, so records are `readonly`. The first version of our plan stored status in Arkiv and
updated it. We dropped that: the contract already has the status, and a locked record is more useful
than an editable one.

**Ownership.** Settle's server wallet owns every record, so merchants don't need Arkiv funds. A trade-off
is that merchants don't own their records. A better version would let them own their data directly.

**Expiry.** Invoice records use the longest allowed lifetime, about 182 days. That suits a testnet app
and an invoice's working life, but real accounting records last for years. Nothing renews them yet,
and that would be needed before real use.

## Does each Arkiv feature change something users see?

| Feature | What users see |
|---|---|
| Queries by invoice | The pay page and receipt show the business name and description instead of an address |
| Queries by merchant | The dashboard, invoice page and CSV show customers and descriptions |
| Queries by customer | A customer logs in by email and sees invoices to pay and past invoices |
| Encrypted `bytes` column | Customers show as "Hidden" until the merchant signs in |
| Creator filter | A stranger's fake entity with our schema name never appears on a pay page |
| `readonly` | No visible control, but the details a customer saw can't change later |
| Expiration | Nothing today. After about 182 days the app would fall back to addresses |

## How a record is written

1. The merchant creates the invoice on Whitechain, with a hash of its details in `ref`.
2. The app sends the details to our server.
3. The server checks that the hash matches the contract and that no record exists yet.
4. It encrypts the customer fields and writes one `readonly` entity.

Step 3 means only someone holding the exact details can save them, and saving needs a real on-chain
invoice first. That limits abuse of a wallet that pays for writes.

Each write costs about 0.00054 test tokens, using a fixed 1,800,000 gas limit because Rabdi estimates
can run low. Writes are never retried automatically, since an uncertain write could otherwise be
saved twice.
