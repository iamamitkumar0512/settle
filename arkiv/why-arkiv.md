# Why Arkiv

## If we swapped Arkiv for Postgres, what would users lose?

**A record that doesn't depend on us.** With Postgres, an invoice's business name and description
would exist only where Settle says they do. In Arkiv, anyone can query them without asking us, and
without an API we control. A customer can check what an invoice said using only a free access key.

**Proof the record wasn't changed.** Our records are `readonly`, so we can't quietly edit an invoice
after it's created. Postgres would ask users to trust that we hadn't. Each record also matches a hash
stored in the invoice on Whitechain, so the details and the payment are tied together.

**Data other apps can use.** An accounting tool could read a merchant's public invoice records
directly, with no integration from us.

Postgres would still win on some things: private data, instant updates, and queries over any field.

## What did you keep off Arkiv, and why?

- **Payment status and money.** The contract is the source of truth, so we don't copy status to
  Arkiv, where a second copy could go stale. It's also why records can be `readonly`.
- **Readable customer details.** Customer names, emails and wallet addresses are never stored in
  plain text. Arkiv's
  guidance is that private information should stay off Arkiv. We chose to store these encrypted
  anyway, using the official `arkiv-encryption` package, so that Settle needs no second database.
- **Webhook secrets in plain text.** A merchant's webhook address and signing secret are stored
  encrypted, with the merchant's address inside the encrypted part so a copied record won't open
  for another merchant. The delivery log is public, and holds only what the chain already shows.
- **The encryption key.** It stays on our server. Losing it means those fields can't be read again.
- **Files.** A PDF invoice is too large for an entity, so it goes to Swarm, encrypted. Arkiv
  holds only where it is. See [`swarm.md`](swarm.md).

That choice has limits. Encryption hides the content, but not the writer, the timing or the fact that
an invoice exists. If our key ever leaked, the encrypted data would be readable for good, because
Arkiv's expiry can't remove copies that someone already made. Our records use sample data on testnet.
For real customers, we'd move these fields off Arkiv.

We hide what we can. Encrypted values are padded so their size doesn't reveal the length of a name,
and the random salt stays inside the encrypted part, so nobody can test guessed emails against the
hash on-chain.

To let customers find their invoices, each record holds a keyed hash of the customer's email or
wallet address. Only our server can compute it, so nobody can test guesses against it. It does show when two
invoices went to the same customer.
