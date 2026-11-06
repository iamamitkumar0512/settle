# Deploying Settle

The app is one Next.js project in `apps/web`. These steps are for Vercel. They have not been run
yet, so treat the first deploy as a test.

## 1. Project settings

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework preset | Next.js |
| Build and install commands | Leave the defaults |
| Include files outside the Root Directory | On. The repo is a workspace. |
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
| `NEXT_PUBLIC_DEMO_STORE_URL` | Optional | The demo store's address. The landing page links to it. |

| `CRON_SECRET` | Recommended | Protects the daily jobs. Vercel Cron sends it by itself. |
| `RESEND_API_KEY` | Optional | Automatic email reminders. Without it none are sent, and nothing else changes. |
| `REMINDER_FROM` | Optional | The sender, on a domain verified in Resend. Without it, Resend's test sender is used, which only delivers to your Resend account's own address. |
| `APP_URL` | Optional | The app's public address, for links in emails. Defaults to the address a request came to. |

Leave these unset. They point the app at test contracts:
`NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_TRANSFER_ADDRESS`,
`NEXT_PUBLIC_SUBSCRIPTIONS_ADDRESS`, `NEXT_PUBLIC_LOGS_RPC_URL`.

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

## 4. The demo store

`apps/shop` is a separate website, so it is a second Vercel project on the same repo.

1. Log in to the Settle app with the account the store is paid into. An account made for this is
   best. Open Developers and copy its keys.
2. Create the project with Root Directory `apps/shop` and leave the commands as they are.
3. Set `SETTLE_KEY_ID`, `SETTLE_KEY_SECRET` and `SETTLE_BASE_URL`. The last is the Settle app's
   address, and it is needed at build time too, because the store loads `checkout.js` from there.
4. Put the store's address in the app's `NEXT_PUBLIC_DEMO_STORE_URL` and redeploy the app.
5. On the same Developers page, add `https://<the store>/api/webhooks/settle` as the webhook. Copy
   its signing secret into the store's `SETTLE_WEBHOOK_SECRET` and redeploy the store.

## 5. Publishing the SDK

1. Set `baseUrl` in `DEFAULTS` in `packages/sdk/src/config.ts` to the deployed app.
2. Run `npm publish` in `packages/sdk`.
3. In `apps/shop/package.json`, replace `workspace:*` with the published version, so the store
   installs it from npm like any other website. `next build` is then enough as its build command.

## Things to know

- **One relayer, one queue.** The relayer sends transactions one at a time inside one server
  process, and rate limits are counted in memory. If the platform runs several copies of the app
  at once, two can pick the same nonce and one request fails. The user can retry. Limits also
  reset when a copy restarts.
- **Time limits.** Routes that send a transaction or write to Arkiv allow 60 seconds.
- **Reminders.** `apps/web/vercel.json` also runs `/api/cron/reminders` once a day at 07:00 UTC.
  It must run once a day, no more and no less: each reminder goes out on the one run that falls
  inside its day-wide window.
- **Subscription payments.** `apps/web/vercel.json` runs `/api/cron/charge` once a day at 06:00
  UTC, which is as often as Vercel's free plan allows. A plan with a shorter period is collected
  late unless something else calls that route, or `/api/relay/charge` for one subscription.
- **Uploads.** PDFs are limited to 2 MB, under Vercel's 4.5 MB request limit.
- **Pay links.** A link copied from one domain doesn't open on another, but its key is the same
  everywhere as long as `ARKIV_DATA_KEY` is.
