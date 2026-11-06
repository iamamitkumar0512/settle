# Whitechain feedback

From building Settle on Whitechain Sepolia at ETHGlobal Mumbai 2026: USDT invoices that customers
pay with one signature and no gas.

## What worked

- **Standard tooling, unchanged.** Foundry, viem and wagmi needed no chain-specific code. viem
  already ships a definition for chain `1874`.
- **One-second blocks.** Our first live gasless payment shows "Confirmed within <= 1 secs" on the
  explorer. A customer waits about as long as for a card.
- **Cheap, steady gas.** The base fee stayed at 5 gwei. A relayed USDT payment used 143,321 gas,
  which is 0.00072 WBT. The L1 data fee on it was 4,227 wei.
- **The test USDT supports EIP-3009 and EIP-2612.** This is what made the product possible:
  paying, refunding and sending USDT with one signature each.
- **Forking the chain.** Our 132 contract tests run against the real USDT on a fork, not a mock.
  That proved the token accepts our signatures and enforces `msg.sender == to` on
  `receiveWithAuthorization`.
- **Verification.** `forge verify-contract --verifier blockscout` with the explorer's `/api` URL
  verified all three contracts on the first try.
- **Standard contracts are already deployed.** Multicall3 lets the dashboard read every invoice in
  one call. Safe and the ERC-4337 EntryPoints are there too.
- **The explorer's API.** `/api/v2/stats` returns a WBT price. We use it to convert gas into USDT,
  so a merchant repays the relayer's gas and nothing more.
- **The `whitechain-dev` agent skill and `llms.txt`.** The deploy and verify references gave us
  the keystore and verification flows without guessing.

## Where we got stuck

1. **`eth_getLogs` limits differ by RPC, and we found them by hitting them.** The public RPC
   answers `query exceeds max block range 10000`. The Ankr endpoint rejected a range of 4,788
   blocks. At one block a second, 10,000 blocks is under three hours, so an invoice's history
   needs more calls every day. We read lists from contract state and use logs only for transaction
   hashes, in 10,000-block windows on the public RPC. We found no hosted indexer for the chain.
2. **USDT's signing details took digging.** The EIP-712 domain is name `Tether USD`, version `1`.
   The token has two `receiveWithAuthorization` overloads, one taking `(v, r, s)` and one taking
   `bytes`. We confirmed all of this by testing against the token on a fork.
3. **Gasless meant building our own relayer.** The account abstraction contracts are deployed, but
   we found no hosted bundler or paymaster for chain `1874`. We wrote the relayer ourselves: one
   send at a time for nonces, a simulation before every send so a bad signature costs no gas, rate
   limits, and fee pricing.
4. **No price feed for WBT on testnet.** To charge a merchant the real gas cost in USDT we needed a
   WBT price, and used the explorer's API for it.
5. **Test USDT can't be minted by builders.** `mint` is owner-only and the owner is the bridge
   contract. On a fork we impersonate the owner.
   <!-- Amit: add how you got test USDT on the live testnet, and whether it was easy. -->
6. **"Partially verified" on the explorer.** All three contracts passed verification, but the explorer
   API reports `is_fully_verified: false`. We think this is because we compile without the metadata
   hash (`bytecode_hash = "none"`). The explorer doesn't say why a match is partial.

7. **No way for a new customer to get test USDT.** A person who opens a pay link and logs in with
   an email has nothing to pay with, and we found no public faucet for the test USDT. We built a
   "test money" button that sends a little from our own supply, once a day per account. That
   supply is small, so it is capped.
8. **Pay-per-request pricing has a floor.** We measured one USDT transfer by signature at 101,265
   gas. At 5 gwei and the explorer's WBT price, that is about 0.037 USDT. The test USDT accepts a
   standard x402-style `transferWithAuthorization` from a wallet holding no WBT, but a charge
   under about 0.25 USDT would lose a large share to gas.
9. **An order costs gas before anyone pays.** A store's order is created on-chain when checkout
   opens, so an abandoned cart costs the relayer a few cents of gas. We cap it per merchant per day.

## What the docs were missing

- **A page for the test USDT:** its address, decimals, EIP-712 domain values, which standards and
  overloads it supports, and how to get some.
- **`eth_getLogs` limits for each RPC option,** and the recommended way to read history.
- **A "gasless on Whitechain" guide:** which account abstraction contracts are deployed, whether a
  hosted bundler or paymaster exists, and a reference relayer for EIP-3009.
- **A WBT price source** to use on testnet.
- **A faucet for the test USDT,** or a note saying who to ask for it.

## Not tested

The WebSocket RPC, the bridge, and mainnet.
