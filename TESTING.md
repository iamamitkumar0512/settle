# Seeing Settle work on Arkiv

Settle keeps the money on Whitechain and everything a person reads on Arkiv. This shows that
working in about five minutes, on the deployed app or a local copy.

## What is on Arkiv

| Record | What it holds | Where you see it |
|---|---|---|
| `settle_invoice_v2` | The business name, what it's for, and encrypted customer details | Pay page, receipt, Invoices, Payments |
| `settle_invoice_file_v1` | Where an invoice's PDF is stored on Swarm | The PDF download button |
| `settle_plan_v1` | A subscription plan's name and description | Subscribe page, Plans, Payments |
| `settle_webhook_v1` | A merchant's webhook address and secret, encrypted | Developers |
| `settle_webhook_delivery_v1` | Each webhook delivery, gone after 7 days | Developers |
| `settle_agent_sale_v1` | A sale to an AI agent, with what was sold encrypted | Agent sales on Invoices |

Settle writes every record from one wallet, `0x7d404608B53998044fDDf5d07f6da8092d155278`, and only
reads records from that wallet.

## 1. See it in the app

| Do this | What came from Arkiv |
|---|---|
| Create an invoice with a business name and a description, then open its pay link | "Chai Point is requesting", and what the invoice is for. The chain holds only the amount and a hash. |
| Send an invoice to a customer's email, then log in as that customer and open **Payments** | The invoice is listed with no link needed. Settle found it with an Arkiv query on a hash of the email. |
| As the merchant, open **Invoices** | Customer names, read from Arkiv and decrypted for this merchant only. |

## 2. See it on the explorer

No key is needed.

| Do this | You should see |
|---|---|
| Open <https://rabdi.explorer.arkiv.network/address/0x7d404608B53998044fDDf5d07f6da8092d155278> | "Transactions sent from this address", newest first, each marked `CREATE`. |
| Create an invoice, wait ten seconds and reload | A new row at the top. Times are in UTC. |

## 3. Query it yourself

This lists the records, and can't write anything. It reads your access key from `apps/web/.env`.
You can get a free key from <https://hub.arkiv.network/access-keys>.

```bash
node --env-file=apps/web/.env apps/web/scripts/arkiv-query.mjs
```

| In the output | You should see |
|---|---|
| `writer` | The wallet above. A stranger's records can't reach the app. |
| `rows` | One per invoice, newest first, with `merchantName`, `amountUsdt`, `publicDetails` and `readonly: true`. |
| `encryptedBytes` | About 540. That is the customer's details, and this script has no key for them. |
| `files` | One per PDF, with its `swarmReference`. |
| `plans` | One per subscription plan. |
| `agentSales` | One per sale to an AI agent. |
| `deliveries` | Recent webhook tries, each with `daysLeft` under 7. |

## 4. Check what stays private

Put a customer's name or email in place of `priya`. This counts the lines that mention it, and
should print `0`.

```bash
node --env-file=apps/web/.env apps/web/scripts/arkiv-query.mjs | grep -c -i "priya"
```

Then copy an `entityKey` from `rows` and open
`https://rabdi.explorer.arkiv.network/entity/<entityKey>`.

| On that page | You should see |
|---|---|
| Flags | `readonly`. Nobody can change what the record says, not even Settle. |
| Expires | A date about six months away. |
| `merchant_name` | Readable. |
| `customer_lookup` | 64 letters and digits. It is a keyed hash, so the email can't be read back. |
| `private_details` | Only a size in bytes. |

## 5. Follow a PDF to Swarm

Attach a PDF to an invoice, then run the query from step 3 and copy its `swarmReference`.

```bash
curl -s https://api.gateway.ethswarm.org/bytes/<swarmReference> | head -c 8 | xxd
```

Every PDF starts with `%PDF`, which `xxd` shows as `2550 4446`. You should see random-looking values
instead. Swarm holds only the encrypted file, so finding the reference on Arkiv doesn't let anyone
read the invoice.
