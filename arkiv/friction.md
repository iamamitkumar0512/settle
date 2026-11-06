# Arkiv friction log

Notes from building Settle on Arkiv, written as they happen.

## 1. Query results wrap each column value

- **Expected:** `entity.body` to be bytes and `entity.note` to be a string, matching the `bytes()` and
  `str()` columns in the schema.
- **Happened:** each column comes back as an object, such as `{ type: "str", value: "..." }`, and a
  `bytes()` value is a hex string inside `value`. `new TextDecoder().decode(entity.body)` threw
  `ERR_INVALID_ARG_TYPE` with SDK 1.0.1 on Node 26.
- **Repro:** select a `bytes()` column with `.select({ body: true }).from(Schema).fetch()` and decode
  `entity.body` directly.
- **Would help:** one short quickstart example that reads a selected value and decodes a bytes column.

## 2. `$creator` filters need `addr()`

- **Expected:** `eq("$creator", "0x...")` to work like other equality filters.
- **Happened:** `InvalidPredicateError`: `"$creator" is a addr, but the value is a str`. The message
  did explain the fix.
- **Repro:** query with `eq("$creator", address)` using a plain string.
- **Would help:** show this filter in the trust guidance, since every app should scope reads to its
  own writer.

## 3. Older docs describe a different data model

- **Expected:** search results for Arkiv to describe the current SDK.
- **Happened:** older material uses annotations and `expiresIn`, while SDK 1.0 uses typed schemas and
  `ExpirationTime`. Our first plan was written against the older shape.
- **What fixed it:** the Mumbai MCP (`https://mcp.arkiv.network/mumbai`), which marks old content as
  not current.

## 4. The SDK's public client type omits `getGasPrice`

- **Expected:** `publicClient.getGasPrice()` to type-check, since the guides require reading the
  current gas price for every write.
- **Happened:** it worked at runtime in JavaScript, but TypeScript reported
  `Property 'getGasPrice' does not exist` with SDK 1.0.1.
- **Repro:** call `client.getGasPrice()` on `createPublicClient` from `@arkiv-network/sdk` in a
  TypeScript project.
- **Workaround:** `getGasPrice(client)` from `viem/actions`.

## 5. `arkiv-encryption` is sized for entities, not files

- **Expected:** to encrypt an invoice PDF with the same package we use for entity fields.
- **Happened:** the package declares `MAX_PLAINTEXT_BYTES = 100000`, described as a policy for one
  small entity. A PDF can be larger. We did not test what happens above the limit.
- **Workaround:** files use AES-256-GCM from `node:crypto` with the same `iv || ciphertext || tag`
  layout and a separate derived key, and go to Swarm instead of an entity.
- **Would help:** a documented pattern for encrypting a file that lives on Swarm with its reference
  on Arkiv, since the Swarm bonus leads straight to this.

## 6. A filter list built step by step doesn't type-check

- **Expected:** to collect predicates in an array and pass them to `and(...)`, adding one only when
  a value is present, the way most query builders allow.
- **Happened:** TypeScript refused the second kind of predicate with `TS2345`:
  `ComparisonNode<ValueRef<"invoice_id", U64Value>>` is not assignable to
  `ComparisonNode<ValueRef<"registry", AddrValue>> | ComparisonNode<ValueRef<"merchant", AddrValue>>`.
  The array's type is fixed by its first elements.
- **Repro:** `const filters = [eq("registry", addr(a)), eq("merchant", addr(b))];` then
  `if (id) filters.push(eq("invoice_id", u64(id)));` then `.where(and(...filters))`, SDK 1.0.1.
- **Workaround:** write both complete `and(...)` calls and choose between them.
- **Would help:** an exported `Expression` type to annotate such an array with, shown in the query
  docs.

## 7. A setting that changes, on records that can't

- **Expected:** a documented pattern for "the current value" when records are `readonly`.
- **Happened:** nothing went wrong, but we had to design it. We write a new record per save, index a
  `saved_at` column, and read `orderBy(desc("saved_at")).limit(1)`. Removing a setting is a record
  with an empty value. Old versions stay readable until they expire.
- **Would help:** a short guide on append-only settings, and whether `$createdAt` can be sorted on
  directly so the extra column isn't needed.

## 8. Expiry worked exactly as described

Not friction, but worth saying. `ExpirationTime.fromDays(7)` on a webhook delivery log gave records
that report 7.00 days left when read back through `$expiresAt`. It removed a cleanup job we would
otherwise have had to write and schedule.
