# How Settle uses Arkiv

## Do filters, edit rights and expiry fit what the app does?

**Filters.** The app asks four questions: "what are this invoice's details?", "what are this
merchant's invoices?", "which invoices were sent to this customer?" and "does this invoice have a
PDF?" So `registry`, `invoice_id`, `merchant` and `customer_lookup` are indexed. Encrypted columns
can't be filtered, which is why the customer lookup is a separate keyed hash of the customer's
email or wallet address. `due_at` is indexed but not used yet.

**Who can edit.** Nobody. An invoice is a document, and changing it after a customer has seen it would
break trust, so records are `readonly`. The first version of our plan stored status in Arkiv and
updated it. We dropped that: the contract already has the status, and a locked record is more useful
than an editable one.

**Ownership.** Settle's server wallet owns every record, so merchants don't need Arkiv funds. A trade-off
is that merchants don't own their records. A better version would let them own their data directly.

**Expiry.** Invoice records use the longest allowed lifetime, about 182 days. That suits a testnet app
and an invoice's working life, but real accounting records last for years. Nothing renews them yet,
and that would be needed before real use. Webhook deliveries are the opposite case: they use a
7-day lifetime, because a delivery log only matters for a short time.

## Does each Arkiv feature change something users see?

| Feature | What users see |
|---|---|
| Queries by invoice | The pay page and receipt show the business name and description instead of an address |
| Queries by merchant | The dashboard, invoice page and CSV show customers and descriptions |
| Queries by customer | A customer logs in by email or with a wallet and sees invoices to pay and past invoices |
| A second entity type | An invoice with a PDF shows a download button. The file is on Swarm; the entity says where |
| A third entity type | A subscription plan shows its name and description on the subscribe page, the merchant's Plans page and the customer's list, instead of a number and an address |
| Encrypted `bytes` column | Customers show as "Hidden" until the merchant signs in |
| Creator filter | A stranger's fake entity with our schema name never appears on a pay page |
| `readonly` | No visible control, but the details a customer saw can't change later |
| Expiration | A merchant's recent deliveries show the last 7 days, with no cleanup job. After about 182 days an invoice would fall back to addresses |

## How a plan record is written

The same way as an invoice. The merchant signs a request to publish the plan, and that request
carries a hash of the plan's name and description. The server checks the details against the
hash, publishes the plan on Whitechain, then writes one `readonly` entity. Nobody else can attach
a name to a merchant's plan, because only the merchant's signature commits to it.

## How a record is written

1. The merchant signs a request to create the invoice. It includes a hash of the invoice's details.
2. The app sends the signed request and the details to our server in one call.
3. The server checks that the details match the signed hash, then creates the invoice on
   Whitechain and reads its id.
4. It encrypts the customer fields and writes one `readonly` entity.

Step 3 means only the merchant's own signature can cause a write, and every record belongs to a
real on-chain invoice. That limits abuse of a wallet that pays for writes. If the write fails, the
app can retry it: the server then checks the details against the hash stored in the contract.

Each write costs about 0.00054 test tokens, using a fixed 1,800,000 gas limit because Rabdi estimates
can run low. Writes are never retried automatically, since an uncertain write could otherwise be
saved twice.
