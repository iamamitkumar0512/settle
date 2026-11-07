# PDF invoices on Swarm

A merchant can attach a PDF to an invoice. Swarm stores the file. Arkiv stores where it is.

## How it works

1. The merchant chooses a PDF on the new-invoice form, or later on the invoice page. Up to 2 MB.
2. The server checks that the caller is the invoice's merchant and that the file is a PDF.
3. The server encrypts it with AES-256-GCM. The registry address and invoice id are bound in as
   associated data, so the file can't be moved to another invoice.
4. The encrypted bytes go to Swarm with `POST /bytes`. Swarm returns a reference, which is a hash
   of the content.
5. The server writes a `settle_invoice_file_v1` entity on Arkiv with that reference. The entity is
   readonly. See [`schema.md`](schema.md).
6. To open the PDF, the server reads the reference from Arkiv, fetches the bytes from Swarm,
   decrypts them and returns the PDF.

Code: [`swarm.ts`](../apps/web/lib/server/swarm.ts),
[`invoice-file.ts`](../apps/web/lib/server/invoice-file.ts) and
[the route](../apps/web/app/api/invoices/[id]/pdf/route.ts).

## Who can open a PDF

The PDF can name the customer, so it is not public:

- the merchant who created the invoice
- the customer the invoice was sent to, by email or by wallet address
- the wallet that paid the invoice
- anyone holding the invoice's pay link

A pay link ends in `#k=<key>`. Browsers don't send that part to a server, so the key stays out of
logs. The server derives the key from the invoice id and a secret, so nothing is stored and the
merchant can copy the same link again later.

The Swarm reference on Arkiv is public, but the bytes behind it are encrypted. The file's size
still shows.

## Why Swarm and Arkiv together

A PDF is too large for an Arkiv entity. Swarm holds files and addresses them by content, so the
reference on Arkiv always points at exactly the bytes that were uploaded. Arkiv makes the file
findable by invoice, and scopes it to our writer wallet.

## Tested

On Fri 6 Nov 2026, against a fork of Whitechain Sepolia with a test deployment of the contract,
the real Arkiv testnet and the public Swarm gateway:

- Registry (test deployment): `0x0d71cae59dc97c25dc911a74e44cbda03f6b641c`
- Arkiv entity key: `0x57f277a69beb6e1270b99bf8930b77e691edd43a9e368a5848f3af8190d0a5d3`
- Swarm reference: `b3f48b38199a993e8de64b6a7d73ae320c65f56496d73d44713f8688ef288efa`
- Open the encrypted bytes:
  <https://api.gateway.ethswarm.org/bytes/b3f48b38199a993e8de64b6a7d73ae320c65f56496d73d44713f8688ef288efa>

The sample PDF was 404 bytes. Swarm holds 432: a 12-byte IV, the ciphertext and a 16-byte tag.
The downloaded PDF matched the upload byte for byte. A second upload, a file that isn't a PDF, a
caller with no login and a wallet that hadn't paid were all refused.

To list the file records:

```bash
ARKIV_ACCESS_KEY=<your key> node apps/web/scripts/arkiv-query.mjs 0x0d71cae59dc97c25dc911a74e44cbda03f6b641c
```

## Live

The deployed app has stored one PDF this way, on invoice 6:

- Arkiv entity key: `0xcd6503a61c2e15b1efb99aa0308f412b15d4732e807d881160f303d18a1d6f12`
- Swarm reference: `93df7c47ace4c66abb8f30f82b9fa3d74db3ce51f00fe8ee718131293f9950dd`
- Open the encrypted bytes:
  <https://api.gateway.ethswarm.org/bytes/93df7c47ace4c66abb8f30f82b9fa3d74db3ce51f00fe8ee718131293f9950dd>

The PDF was 105,904 bytes, and Swarm holds 105,932.

## Postage batch

- **What the app uses:** the public gateway `https://api.gateway.ethswarm.org` with the null stamp
  (a batch ID of 64 zeros), in the test above and on the live app. The gateway pays for storage, and
  we don't know how long it keeps files.
- **Our own batch:** none yet.

`SWARM_BEE_URL` and `SWARM_BATCH_ID` set the node and batch. See `apps/web/.env.example`.

## What got in the way

- Uploads need a postage batch, bought on Gnosis Chain through a funded Bee node. We had neither at
  the event, so Settle uses the public gateway.
- `arkiv-encryption` is sized for small entities, so files use their own encryption. See
  [`friction.md`](friction.md).

## Video

[ADD timestamp]
