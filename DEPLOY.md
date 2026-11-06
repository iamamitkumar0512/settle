# Deploying Settle

The app is one Next.js project in `apps/web`. These steps are for Vercel. They have not been run
yet, so treat the first deploy as a test.

## 1. Project settings

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework preset | Next.js |
| Build and install commands | Leave the defaults |
| Include files outside the Root Directory | On. The app imports `packages/sdk`. |
| Node.js | 20 or newer |

The repo is a pnpm workspace, so dependencies install from the repo root.

## 2. Environment variables

Use the same values as your local `apps/web/.env`.

| Variable | Needed | What it is |
|---|---|---|
| `PRIVY_APP_ID` | Yes | Email login. |
| `RELAYER_PK` | Yes | The relayer wallet's key. It pays gas, so it needs WBT. |
| `ARKIV_ACCESS_KEY` | Yes | Reads and writes on Arkiv. |
| `ARKIV_PRIVATE_KEY` | Yes | The wallet that writes Arkiv records. It needs Arkiv test tokens. |
| `ARKIV_DATA_KEY` | Yes | Encrypts customer details. **Must be the same key you use locally.** A different key can't read existing records, and it changes every pay link. |
| `RPC_ENDPOINT` | Recommended | Server RPC for the relayer. Without it the app uses the public RPC. |
| `NEXT_PUBLIC_RPC_URL` | Optional | Browser RPC. Defaults to the public RPC. Anything here is visible to visitors. |
| `SWARM_BEE_URL`, `SWARM_BATCH_ID` | Optional | PDF invoices. The upload field is hidden without both. |
| `SHOP_MERCHANT_PK` | Optional | The demo shop's wallet. `/shop` can't take orders without it. |

Leave these unset. They point the app at test contracts:
`NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_TRANSFER_ADDRESS`, `NEXT_PUBLIC_LOGS_RPC_URL`.

Optional tuning, with defaults: `MIN_INVOICE_USDT` (1), `RELAYER_MIN_WBT` (0.005),
`RELAYER_MAX_FEE_GWEI` (50), `RELAYER_FREE_PER_DAY` (500), and `RELAY_FEE_USDT` and
`WITHDRAW_FEE_USDT` (0.05 each, used only when the WBT price can't be read).

## 3. After the first deploy

1. In the Privy dashboard, add the deployed domain to the app's allowed origins. Email login fails
   on a domain Privy doesn't know.
2. Open `https://<your domain>/api/relay/health`. It should show the relayer's address, its WBT
   balance and `"ok": true`.
3. Open `https://<your domain>/api/relay/quote`. `available` should be `true`.
4. Create an invoice, pay it from a second browser profile, then refund part of it.
5. Put the deployed URL in [`README.md`](README.md) and [`arkiv/reach.md`](arkiv/reach.md).

## Things to know

- **One relayer, one queue.** The relayer sends transactions one at a time inside one server
  process, and rate limits are counted in memory. If the platform runs several copies of the app
  at once, two can pick the same nonce and one request fails. The user can retry. Limits also
  reset when a copy restarts.
- **Time limits.** Routes that send a transaction or write to Arkiv allow 60 seconds.
- **Uploads.** PDFs are limited to 2 MB, under Vercel's 4.5 MB request limit.
- **Pay links.** A link copied from one domain doesn't open on another, but its key is the same
  everywhere as long as `ARKIV_DATA_KEY` is.
