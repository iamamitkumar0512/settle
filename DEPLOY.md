# Deploying Settle

Three things go live. The contracts are already deployed and verified, so nothing changes there.

| What | Where | From |
|---|---|---|
| The Settle app | Vercel project 1 | `apps/web` |
| The demo store, Chai Point | Vercel project 2 | `apps/shop` |
| The SDK, `settle-pay` | npm | `packages/sdk` |

These steps have not been run yet, so treat the first deploy as a test. Allow about an hour.

## What is needed from you

Only you can do these, because they need your accounts, keys or funds.

| # | What | Why |
|---|---|---|
| 1 | Commit and push `main` | Vercel builds from GitHub. |
| 2 | A Vercel account connected to the GitHub repo | Hosts both projects. The free plan is enough. |
| 3 | The values in your local `apps/web/.env` | They become the app's settings on Vercel. |
| 4 | Access to the Privy dashboard | To allow the deployed address, and to allow wallet export. |
| 5 | WBT in the relayer wallet, 0.2 or more | It pays the gas for every relayed action. |
| 6 | Test USDT in the relayer wallet, about 40 | It funds the "Add test USDT" button for new accounts. |
| 7 | A second Settle account, made with an email used only for the store | Its keys go into the store. |
| 8 | An npm account | To publish `settle-pay`. Optional, but the docs tell developers to install it. |
| 9 | A Swarm postage batch, from the Swarm booth | Optional. Needed for the Swarm bonus. |
| 10 | A domain verified in Resend | Optional. Without it, emails only reach your own Resend address, and "Email it from Settle" tells a merchant it is in test mode. The mail app and copy options still work. |

The relayer wallet is `0x21dc07cFe6Aa4f141b5950CFb72F310F5817836C`.

## Step 1: Deploy the app

Create a Vercel project from the repo with these settings.

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework preset | Next.js |
| Build and install commands | Leave the defaults |
| Include files outside the Root Directory | On |
| Node.js | 20 or newer |

Add these settings before the first build.

| Variable | Needed | Value |
|---|---|---|
| `PRIVY_APP_ID` | Yes | Same as local. |
| `RELAYER_PK` | Yes | Same as local. |
| `ARKIV_ACCESS_KEY` | Yes | Same as local. |
| `ARKIV_PRIVATE_KEY` | Yes | Same as local. |
| `ARKIV_DATA_KEY` | Yes | **Exactly the same as local.** A different key can't read existing records, and it changes every pay link. |
| `RPC_ENDPOINT` | Recommended | Same as local. Without it the app uses the public RPC. |
| `DEMO_TOPUP_USDT` | Yes, for judges | `5`. Without it a new customer has no way to get test money. |
| `CRON_SECRET` | Recommended | Any long random text. It protects the two daily jobs. |
| `SWARM_BEE_URL`, `SWARM_BATCH_ID` | Optional | PDF invoices. The upload field is hidden without both. |
| `RESEND_API_KEY` | Optional | Reminder emails. |
| `REMINDER_FROM` | Optional | A sender on your verified Resend domain, for example `Settle <hello@yourdomain.com>`. Needed before reminders reach customers. |
| `NEXT_PUBLIC_RPC_URL` | Optional | Browser RPC. Anything here is visible to visitors. |

To make a `CRON_SECRET`:

```bash
openssl rand -hex 32
```

**Never set these on Vercel.** They are for local testing only:
`WEBHOOK_ALLOW_LOCAL`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_TRANSFER_ADDRESS`,
`NEXT_PUBLIC_SUBSCRIPTIONS_ADDRESS`, `NEXT_PUBLIC_LOGS_RPC_URL`.

Deploy, and note the address Vercel gives you. It is called `<app>` below.

## Step 2: Allow the address in Privy

1. In the Privy dashboard, add `<app>` to the app's allowed origins. Email login fails on an
   address Privy doesn't know.
2. Check that exporting an embedded wallet's key is allowed. The Developers page uses it for
   "Reveal key secret".

## Step 3: Check the app

| Open | You should see |
|---|---|
| `<app>/api/relay/health` | The relayer's address, its WBT balance and `"ok": true`. |
| `<app>/api/relay/quote` | `"available": true` and `"topUpAmount": "5000000"`. |
| `<app>` | The landing page, with a live network fee in the card. |
| `<app>/docs` | The public guide. |

Then log in with an email, create an invoice for 1 USDT, and pay it from a private window with
another email. This is Parts 2 and 3 of [`TESTING.md`](TESTING.md).

## Step 4: Publish the SDK

1. In `packages/sdk/src/config.ts`, set `baseUrl` in `DEFAULTS` to `<app>`. A store can then leave
   `baseUrl` out.
2. Commit that, then publish:

```bash
cd packages/sdk
npm login
npm publish
```

3. Check that it is there:

```bash
npm view settle-pay version
```

If you skip this step, everything still works, because the store builds the SDK from this repo.
Only the line `npm install settle-pay` in the docs would fail for an outside developer.

## Step 5: Deploy the demo store

1. In `<app>`, log in with the email you keep for the store. Open **Developers**, copy the Key ID,
   and press **Reveal key secret** to copy the secret.
2. Create a second Vercel project from the same repo.

| Setting | Value |
|---|---|
| Root Directory | `apps/shop` |
| Framework preset | Next.js |
| Build and install commands | Leave the defaults |
| Include files outside the Root Directory | On |

3. Add its settings.

| Variable | Value |
|---|---|
| `SETTLE_KEY_ID` | The store account's Key ID. |
| `SETTLE_KEY_SECRET` | The store account's Key Secret. |
| `SETTLE_BASE_URL` | `<app>`, with no slash at the end. It is needed at build time too. |
| `SETTLE_WEBHOOK_SECRET` | Leave empty for now. Step 6 fills it. |

4. Deploy, and note its address. It is called `<store>` below.

A new account can hold 5 unpaid orders until its first payment arrives. Buy one item from the
store yourself straight away, so judges who open checkout and leave can't block it.

## Step 6: Connect the two

1. In the app's Vercel settings, set `NEXT_PUBLIC_DEMO_STORE_URL` to `<store>` and redeploy the app.
   The landing page and docs then link to the store.
2. In `<app>`, logged in as the store account, open **Developers**. Under Webhooks, save
   `<store>/api/webhooks/settle`.
3. Press **Show secret**, copy it into the store's `SETTLE_WEBHOOK_SECRET` on Vercel, and redeploy
   the store.
4. Press **Send test event**. It should say "Test event delivered."

## Step 7: Run it live and collect proof

Follow [`TESTING.md`](TESTING.md) on the deployed app. While you do, save these explorer links.
The README's proof table has the first three kinds already and none of the rest.

| Action | Where the link appears |
|---|---|
| A store order paid through checkout | The receipt's "Proof on Whitechain" |
| A subscription started | The explorer, from the customer's address |
| A subscription payment collected | The explorer, from the relayer's address |
| A subscription cancelled | The explorer, from the relayer's address |
| A withdrawal with no gas | The "Sent." line on the Account page |

Give me the links and I will add them to the README.

## Step 8: Finish the submission

| File | What to fill in |
|---|---|
| `README.md` | The deployed address and the video link, at the top. |
| `arkiv/reach.md` | The deployed address, and your own answer on whether you'll keep building. |
| `arkiv/swarm.md` | The postage batch and the video timestamp, if you got a batch. |
| `WHITECHAIN_FEEDBACK.md` | One line on how you got test USDT, where the comment asks. |

Then record the video, 2 to 4 minutes, showing each party: the merchant, the paying customer and
the store. Submit on the ETHGlobal dashboard before 09:00 IST on Saturday, with Whitechain and
Arkiv as partners. Aim for 08:30, not 08:59.

## Things to know

- **Daily jobs.** `apps/web/vercel.json` runs `/api/cron/charge` at 06:00 UTC and
  `/api/cron/reminders` at 07:00 UTC. Once a day is as often as Vercel's free plan allows. A plan
  billed more often is collected late unless its merchant presses **Collect now**.
- **Several copies of the server.** Vercel can run more than one. The relayer sends again if two
  copies pick the same transaction number. Rate limits and the once-a-day test money are counted
  inside each copy, so they are looser than they look.
- **Test money runs down.** Each new account can take up to 5 test USDT. Money that customers
  spend lands in your merchant and store accounts, and you can send it back to the relayer from
  the Account page.
- **Time limits.** Routes that send a transaction or write to Arkiv allow 60 seconds.
- **Uploads.** PDFs are limited to 2 MB, under Vercel's 4.5 MB request limit.
- **Pay links.** A link copied from one address doesn't open on another, but its key is the same
  everywhere as long as `ARKIV_DATA_KEY` is.
- **Optional tuning, with defaults.** `MIN_INVOICE_USDT` (1), `RELAYER_MIN_WBT` (0.005),
  `RELAYER_MAX_FEE_GWEI` (50), `RELAYER_FREE_PER_DAY` (500), `APP_URL` (the address a request came
  to), and `RELAY_FEE_USDT` and `WITHDRAW_FEE_USDT` (0.05 each, used only when the WBT price can't
  be read).
