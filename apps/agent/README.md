# Restock agent

A cafe's AI agent that buys from [Chai Point](../shop) by itself. Gemini reads the stockroom and the
store's catalog, decides what to reorder, and pays in USDT over x402. Nobody approves anything, and
its wallet holds no WBT.

It uses the standard `@x402/fetch` client. Nothing here is specific to Settle, so any x402 agent can
buy from any store built on [`@akhr2405/settle-pay`](../../packages/sdk).

## Run it

Make its wallet. The key goes into `apps/agent/.env` and is never printed.

```bash
pnpm agent:wallet
```

Send the printed address 10 test USDT from your Settle Account page, and no WBT. Then fill in
`apps/agent/.env` from [`.env.example`](.env.example).

Check everything from outside, with no AI involved. It makes one real purchase of 1.25 USDT.

```bash
pnpm agent:check
```

Run the agent. It needs `GEMINI_API_KEY` in the same file.

```bash
pnpm agent:start
```

## What limits it

- **Per payment:** the standard client refuses to sign above `MAX_PER_PAYMENT`.
- **Who it can pay:** it signs only for `STORE_ADDRESS`.
- **In total:** its budget is what its wallet holds. Fund it with no more than you would let it spend.
- **Retries:** an order keeps one id, so repeating a lost request can't pay twice.
- **What the AI can do:** it has three tools, and store text is treated as data. A misled agent can
  still make a bad purchase within these limits.
