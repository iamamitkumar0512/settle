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
