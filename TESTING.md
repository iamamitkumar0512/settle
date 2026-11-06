# Testing Settle by hand

This walks through every feature, with what you should see at each step. It takes about an hour.
Do it once locally, then repeat the parts marked **Live** on the deployed app.

The things the tracks judge have a part each: the SDK in Parts 10 and 11, Arkiv in Part 12, Swarm
in Part 13 and AI agents in Part 14.

Everything here was also checked automatically on a local copy of the chain, with a scripted
wallet. Email login could not be checked that way, so the steps marked **Email only** matter most.

## Before you start

**1. Give the relayer test USDT.** The "Add test USDT" button sends money from the relayer's own
balance. Send about 30 test USDT to `0x21dc07cFe6Aa4f141b5950CFb72F310F5817836C`. It also needs
WBT for gas: 0.2 WBT is plenty.

**2. Check your settings.** `apps/web/.env` now has two lines added for local testing:

```
DEMO_TOPUP_USDT=10
WEBHOOK_ALLOW_LOCAL=true
```

The second one must never be set on the deployed app. On the deployed app the first should be 5,
so the relayer's test USDT lasts.

**3. Start the app.**

```bash
pnpm dev
```

It runs at `http://localhost:3000`. Open `http://localhost:3000/api/relay/quote` and check that
`available` is `true` and `topUpAmount` is `"10000000"`.

**4. Use two browser windows.**

| Window | Who | Log in with |
|---|---|---|
| Normal window | The merchant | Your main email |
| Private window | The customer | A second email |

**5. Keep amounts small.** Locally a new account can add up to 10 test USDT, once a day. The
amounts below let one customer account finish every step with a single top-up.

| Step | Customer spends |
|---|---|
| Pay an invoice | 1.00 |
| Subscribe to a plan, two payments | 2.00 |
| Buy from the store, three times | 3.75 |
| Pay the SDK example's order | 1.00 |
| Total | 7.75 |

## Part 1: Pages anyone can open

| Do this | You should see |
|---|---|
| Open `/` | "The payment gateway for USDT." A card showing the contract, a count, and a live network fee. Two cards: "On your website" and "With a link". A fee comparison. Six feature cards. |
| Press **Docs** | A public guide with eight sections and copy buttons. No login needed. |
| Open `/anything-else` | "We can't find that page", with two buttons. |
| Shrink the window to phone width | Nothing runs off the side. The fee comparison becomes a list. |

## Part 2: The merchant creates an invoice

| Do this | You should see |
|---|---|
| Open `/dashboard` in the normal window | "Log in to Settle" with an email box. No mention of wallets or gas. |
| Log in with your main email and the code sent to it | The Invoices page. "No invoices yet" if the account is new. A "Test mode" badge in the header. |
| Press **New invoice** | A form, with a preview of what the customer sees on the right. |
| Fill in: business name `Chai Point`, customer name, **the customer's email**, what it's for, amount `1.00`, a due date 2 days from now | The preview updates as you type. A line shows the network fee, about 0.05 USDT. |
| Press **Create invoice** | "Creating invoice…" for a few seconds, then the invoice with a **Copy pay link** button. No wallet popup. **Email only.** |
| Press **Copy pay link** | "Link copied". Keep this link for Part 3. |
| Go back to Invoices | The invoice is listed as "Due soon". Outstanding shows 1.00. |
| Press **New invoice** again | An empty form, not the last invoice. The business name is already filled in as `Chai Point`. |

## Part 3: The customer pays

| Do this | You should see |
|---|---|
| Paste the pay link in the private window | "Chai Point is requesting 1.00 USDT", with the due date and an "Add to calendar" link. No `0x` address anywhere. |
| Press **Add to calendar** | A file named `settle-invoice-<number>.ics` downloads. Opening it adds an all-day event on the due date. |
| Log in with the second email | "Confirm payment" showing balance 0.00. An **Add 1.00 test USDT** button, not a QR code. **Email only.** |
| Open `/account` instead and press **Add 10.00 test USDT** | "Adding your test money…", then the balance shows 10.00 within a few seconds. |
| Press it again | "You've had today's test money. Try again tomorrow." |
| Go back to the pay link and press **Pay 1.00 USDT** | "Sending your payment…", then "Payment complete". No popup and no gas. **Email only.** |
| Press **View receipt** | A receipt showing "You paid 1.00 USDT", "Paid to Chai Point", and a "Proof on Whitechain" link that opens the explorer. |
| Press **See all your payments** on the receipt | "Your payments", with the invoice under "Past invoices" as Paid. **Payments** is highlighted in the menu. |

**Live:** save the explorer link from this receipt. It is your gasless payment proof.

## Part 4: Refund and cancel

| Do this | You should see |
|---|---|
| In the merchant window, open the paid invoice | Status Paid. "You received" shows 1.00 minus the network fee. A Refund box. A timeline with "Paid" and "Network fee". |
| Enter `0.40` and press **Refund 0.40 USDT** | "Refund sent". Status becomes "Partly refunded". The timeline gains "Refund sent". |
| In the customer window, reload the receipt | A "Partial refund" line of +0.40, and "Your total cost 0.60". |
| Create another invoice for `1.00`, open it, press **Cancel invoice**, then **Yes, cancel** | "Cancelled. This invoice can no longer be paid." |
| Open that invoice's pay link | "This invoice was cancelled." |

## Part 5: Reminders

| Do this | You should see |
|---|---|
| Create an invoice for `1.00`, sent to the customer's email, due tomorrow | It is listed as "Due soon". |
| In the customer window, open `/dashboard` | A banner: "An invoice from Chai Point is due soon", with **Pay now**. The menu shows "Payments" with a count of 1. |
| Press **Dismiss** | The banner goes. It returns only if something new becomes due. |
| In the merchant window, open that invoice and press **Remind customer** | The reminder message, with three choices: **Email it from Settle**, **Open in my mail app**, **Copy message**. |
| Press **Open in my mail app** | Your mail app opens with the customer, subject and message filled in. |
| Press **Email it from Settle** with no domain verified in Resend | "Email from Settle is in test mode and can't reach this address yet." The mail app and copy options stay on screen. Your terminal prints `Email not sent: Resend only delivers to its account's own address…`. |
| To see a real send, create an invoice whose customer email is the one your Resend account uses, and press **Email it from Settle** on it | "Sent to" that address, and the email arrives. Resend allows this address without a domain. |
| Press it again after reloading | "A reminder already went out today." |

To email any customer, verify a domain in Resend and set `REMINDER_FROM` to an address on it. See
[`DEPLOY.md`](DEPLOY.md).

Cancel this invoice afterwards, so it stops showing as due.

## Part 6: PDF and export

| Do this | You should see |
|---|---|
| Create an invoice and choose a PDF under 2 MB before pressing Create | "Create invoice" finishes, then the invoice page shows the PDF with a download button. |
| Open its pay link as the customer | A **Download PDF invoice** button. The file opens. |
| On Invoices, press **Export CSV** | A file `settle-invoices-<date>.csv`. Its columns include `order_reference`, `network_fee` and `net_received`. |

Keep this invoice. Part 13 uses it to check where the PDF is stored and who can open it.

## Part 7: Subscriptions

| Do this | You should see |
|---|---|
| Merchant: open **Plans**, press **New plan** | The business name is already filled in. |
| Name `Tea club`, amount `1.00`, billed **Every minute (for testing)**, press **Create plan** | The plan, with **Copy subscribe link**. |
| Customer: open the subscribe link | "Chai Point offers Tea club for 1.00 USDT every minute". |
| Choose 3 payments and press **Subscribe for 1.00 USDT** | "You're subscribed". The first payment is taken at once. **Email only.** |
| Merchant: reload Plans after a minute | The subscriber shows "Due now" and a **Collect now** button. |
| Press **Collect now** | The payment is collected, and "Payments left" drops. |
| Customer: open **Payments** | "Tea club from Chai Point" under Subscriptions, marked Active, with a **Cancel** button. |
| Press **Cancel** | It stays listed, marked Cancelled: "Cancelled <time> by you. Nothing more will be taken." The Cancel button is gone. |
| Press **History and proof** | Each step, newest first, with its explorer link: the cancel, each payment, and the start. |
| Merchant: reload Plans | Under the plan, the subscriber reads "Cancelled by the customer" with how many payments were made and the proof link. |

Subscribe again and let the merchant press **Cancel** instead. The merchant then reads "Cancelled by
you", and the customer reads "by the business".

**On the explorer.** These steps are not in the customer's or merchant's own Transactions tab,
because Settle's relayer sends them. Open **History and proof** to reach them. Payments also show
in the customer's Token transfers tab. A cancel moves no money, so it shows in neither place.

**Live:** note three explorer links here, for subscribe, collect and cancel. The README has none yet.

## Part 8: Account and withdrawing

| Do this | You should see |
|---|---|
| Merchant: open **Account** | The balance, what you logged in with, Add money, and Withdraw. |
| Enter another address you control and `0.50`, press **Send USDT** | A line showing the network fee and what they receive. Then "Sent." with an explorer link. |
| Check the other address on the explorer | It received 0.50 minus the fee. |

## Part 9: Developers page and keys

| Do this | You should see |
|---|---|
| Merchant: open **Developers** | "API keys" with a Key ID, which is your account's address. |
| Press **Reveal key secret** | A window from the login provider showing your private key. Settle never sees it. **Email only, and the one step never run before.** If it fails, allow wallet export in the Privy dashboard. |
| Scroll down | Install, server, page and webhook code, filled in with your Key ID and this site's address. Each has a copy button. |

Copy the Key ID and Key Secret for Parts 10 and 11. Treat the secret like a password.

## Part 10: The demo store

**Set it up.** Copy `apps/shop/.env.example` to `apps/shop/.env` and fill it in:

```
SETTLE_KEY_ID=<your Key ID>
SETTLE_KEY_SECRET=<your Key Secret>
SETTLE_BASE_URL=http://localhost:3000
SETTLE_WEBHOOK_SECRET=
```

Then start it. It runs at `http://localhost:3100`.

```bash
pnpm dev:store
```

| Do this | You should see |
|---|---|
| Open `http://localhost:3100` | Chai Point, in the same dark style as Settle, with three products. Below them, "How this store takes payment" prints its 22 lines of Settle code. |
| In the customer's private window, press **Buy** on Ginger tulsi tea, 1.25 USDT | A small Settle window opens at once, saying "Preparing your order…". The store page dims behind it. |
| Wait a few seconds | The window shows "Chai Point, Ginger tulsi tea, 1.25 USDT" and a **Pay 1.25 USDT** button. No address. |
| Press **Pay 1.25 USDT** | "Payment complete. Taking you back to localhost:3100…". The window closes itself. |
| Look at the store page | "Order confirmed. Thank you. Your tea is on its way.", with an order number starting `chai-`. |
| Press **View your receipt** | The receipt on Settle. |
| Merchant: open Invoices | The order is listed as "Store order" with its `chai-` number, marked Paid. |
| Press **Buy** on another product, then close the Settle window without paying | The store page returns to normal. In Invoices the order shows "Awaiting payment", and Outstanding does not go up. |

**Webhooks.**

| Do this | You should see |
|---|---|
| Merchant: on Developers, under Webhooks, enter `http://localhost:3100/api/webhooks/settle` and press **Save webhook** | The address and a signing secret, hidden until you press **Show secret**. |
| Copy the secret into `SETTLE_WEBHOOK_SECRET` in `apps/shop/.env` and restart the store | Nothing visible. |
| Press **Send test event** | "Test event delivered." A `webhook.test` row marked "Delivered · 200". |
| Buy something from the store again | Within a few seconds, an `order.paid` row marked "Delivered · 200". The store's terminal prints `Ship order chai-…`. |
| Refund that order from its invoice page | A `refund.created` row. |
| Change `SETTLE_WEBHOOK_SECRET` in the store's `.env` to something wrong, restart the store, and buy again | An `order.paid` row marked "Failed · 400" with a **Resend** button. |
| Put the right secret back, restart the store, and press **Resend** | A new row for the same order says "Delivered · 200", and the Resend button goes away. |

## Part 11: The SDK on its own

Part 10 tested the SDK through a store. This runs it straight from a terminal, so you see each
call work by itself: fees, create an order, wait for the payment, refund, read the status and read
the balance. Keep the app running. The command reuses the keys in `apps/shop/.env` from Part 10,
so no secret is typed into the terminal.

```bash
pnpm --filter settle-pay example
```

| Do this | You should see |
|---|---|
| Run the command | `1. Connected to http://localhost:3000. A payment costs … USDT in network fees.` Then `2. Order <number> created for 1.00 USDT. Pay it here:` with a pay link. Then `3. Waiting up to 10 minutes for the payment…` |
| Open the printed link in the customer's private window | "Chai Point is requesting 1.00 USDT" and "Masala chai blend". The page says **Order** and **Pay by**, not Invoice and Due, and has no calendar link. |
| Press **Pay 1.00 USDT** | "Payment complete". |
| Look at the terminal | Within a few seconds, four more lines: `4. Paid by 0x…. Your order number came back: example-…`, `5. Refunded 0.40 USDT. Proof: 0x…`, `6. Order <number> is now "refunded", with 0.40 USDT refunded.` and `7. This account holds … USDT.` Then `Everything worked.` |
| Merchant: open Invoices | The order is listed as "Store order" with its `example-` number, marked "Partly refunded". |
| Customer: press **View receipt**, and reload if needed | "You paid 1.00 USDT" and a "Partial refund" line of +0.40. |

**Check that mistakes get a plain answer.** Each of these should stop at once.

```bash
SETTLE_KEY_SECRET=0x0000000000000000000000000000000000000000000000000000000000000001 pnpm --filter settle-pay example
```

It prints `Stopped: keyId and keySecret belong to different accounts. (key_mismatch)`.

```bash
SETTLE_BASE_URL=http://localhost:3999 pnpm --filter settle-pay example
```

It prints `Stopped: Couldn't reach Settle. (network)`.

**Live:** run the example against the deployed app by putting its address in front. The keys are
the same, because an email account has the same key on every address.

```bash
SETTLE_BASE_URL=https://<your deployed app> pnpm --filter settle-pay example
```

**Install it the way another developer would.** This packs the SDK as npm will ship it, installs
it in a folder outside this project, and uses that copy. Run all four from the project folder.

```bash
pnpm --filter settle-pay build
```

```bash
npm pack ./packages/sdk --pack-destination /tmp
```

```bash
npm install --prefix /tmp/settle-outside /tmp/settle-pay-0.1.0.tgz
```

```bash
node --env-file=apps/shop/.env -e '
const Settle = require("/tmp/settle-outside/node_modules/settle-pay");
const { createHmac } = require("node:crypto");
const settle = new Settle({ keyId: process.env.SETTLE_KEY_ID, keySecret: process.env.SETTLE_KEY_SECRET });
const body = JSON.stringify({ id: "evt_1", type: "webhook.test", created: "now", data: { message: "hi" } });
const signature = createHmac("sha256", "secret").update(body).digest("hex");
console.log("Real webhook accepted:", settle.webhooks.verify(body, signature, "secret").type);
try { settle.webhooks.verify(body + " ", signature, "secret"); } catch (error) { console.log("Changed webhook refused:", error.code); }
settle.fees().then((fees) => console.log("Installed copy reached Settle. A payment costs", fees.payment, "USDT."));
'
```

You should see three lines:

```
Real webhook accepted: webhook.test
Changed webhook refused: invalid_webhook_signature
Installed copy reached Settle. A payment costs … USDT.
```

## Part 12: Arkiv

The chain holds the money and only a hash of each invoice. Arkiv holds everything a person reads:
the business name, what an invoice is for, who it was sent to, each plan's name, where a PDF is,
the webhook address and the webhook log. Customer details are encrypted before they are written.

**In the app.** You have already seen Arkiv answer. These screens show nothing useful without it.

| Where | What came from Arkiv |
|---|---|
| Part 3, the pay page | "Chai Point is requesting", and what the invoice is for. |
| Part 5, the customer's banner and "Payments" count | Settle found the invoice with an Arkiv query on a hash of the customer's email. Nobody sent a link. |
| Part 2, the merchant's Invoices list | Customer names, read from Arkiv and decrypted on the server. |
| Part 10, the webhook log on Developers | Each delivery is an Arkiv record that deletes itself after 7 days. |

**In the Arkiv explorer.** No key is needed. Settle writes every record from one wallet.

| Do this | You should see |
|---|---|
| Open <https://rabdi.explorer.arkiv.network/address/0x7d404608B53998044fDDf5d07f6da8092d155278> | "Transactions sent from this address", newest first, each marked `CREATE`. |
| Create an invoice in the app, wait ten seconds and reload that page | A new row at the top with the current time, shown in UTC. |

**From a terminal.** This lists the records themselves. It reads your Arkiv access key from
`apps/web/.env` and can't write anything.

```bash
node --env-file=apps/web/.env apps/web/scripts/arkiv-query.mjs
```

| In the output | You should see |
|---|---|
| `writer` | `0x7d404608B53998044fDDf5d07f6da8092d155278`. Every query is limited to records this wallet wrote, so a stranger's records can never show up in the app. |
| `rows` | One per invoice, newest first, up to 20. Each has `merchantName`, `amountUsdt`, `dueAt`, `publicDetails` with what it's for, and `readonly: true`. Store orders have `"order":true` inside `publicDetails`. |
| `encryptedBytes` in each row | A number around 540. That is the customer's name and contact, encrypted. The script has no key for it. |
| `files` | One per PDF, with a `swarmReference`. Part 13 uses it. |
| `plans` | The Tea club plan from Part 7, with its name and amount. |
| `deliveries` | The webhook tries from Part 10, newest first, each with `daysLeft` just under 7. |

A line starting `ExperimentalWarning` can be ignored.

**Check that customer details stay private.** Put the customer's name or email in place of the
word `priya`. It counts the lines that mention it, and should print `0`. As a comparison, the
business name `chai point` prints a number above 0, because business names are public.

```bash
node --env-file=apps/web/.env apps/web/scripts/arkiv-query.mjs | grep -c -i "priya"
```

**Look at one record.** Copy an `entityKey` from `rows` and open
`https://rabdi.explorer.arkiv.network/entity/<entityKey>`.

| On that page | You should see |
|---|---|
| Top | `schema: settle_invoice_v2`, status LIVE, owner `0x7d404608…`. |
| Flags | `readonly`. Nobody can change what the record says, not even Settle. |
| Expires | A date about six months away. |
| `merchant_name` | Readable, for example `Chai Point`. |
| `customer_lookup` | 64 letters and digits. It is a hash, so the email can't be read back from it. |
| `private_details` | Only a size in bytes, of type `application/vnd.arkiv.encrypted.v1`. |

**Live:** nothing changes. The deployed app writes with the same wallet to the same Arkiv network,
so the explorer page and the query show its records too.

## Part 13: Swarm

A PDF invoice is encrypted on the server and stored on Swarm. Arkiv keeps the Swarm reference, so
the app can find the file by invoice. Use the invoice with a PDF from Part 6.

The PDF field only shows when `SWARM_BEE_URL` and `SWARM_BATCH_ID` are set in `apps/web/.env`.
Yours are set, and point at Swarm's public gateway.

**Who can open it.**

| Do this | You should see |
|---|---|
| Merchant: open the invoice and press **Download PDF invoice** | `invoice-<number>.pdf` downloads. It is the file you attached. |
| Merchant: press **Copy pay link**. Customer window: open the account menu and press **Log out**, then open the link | **Download PDF invoice** works with nobody logged in. The link's ending, `#k=…`, is the key. |
| In a new tab of that window, open the same link without its `#k=…` ending | "A PDF invoice is attached. Log in to open it." There is no download button. |
| Log in on that tab as the customer the invoice was sent to | The PDF downloads. A browser wallet presses **Sign in to open the PDF invoice** first. **Email only** for an email customer. |
| If you have a third account: log in with it on the link without `#k=…` and try to download | "Only the business and the customer this invoice was sent to can open its PDF." |
| Merchant: on a new invoice, choose a PDF larger than 2 MB | "The PDF must be 2 MB or smaller." |

**Find the file on Swarm.** Run the Arkiv query from Part 12 again:

```bash
node --env-file=apps/web/.env apps/web/scripts/arkiv-query.mjs
```

Under `files`, find your invoice's number. You should see `mediaType` as `application/pdf`,
`sizeBytes` as your file's size, `encryption` starting `aes-256-gcm`, and a `swarmReference` of 64
letters and digits. Put that reference into the next two commands.

```bash
curl -s https://api.gateway.ethswarm.org/bytes/<swarmReference> | wc -c
```

It prints your PDF's size plus 28. The extra bytes are what the encryption adds.

```bash
curl -s https://api.gateway.ethswarm.org/bytes/<swarmReference> | head -c 8 | xxd
```

Every PDF starts with the letters `%PDF`, which `xxd` shows as `2550 4446`. You should see
different, random-looking values. That proves Swarm holds only the encrypted file, and that anyone
who finds the reference on Arkiv still can't read the invoice.

**For the Swarm bonus.** The public gateway pays for storage itself and may drop files. Get a
postage batch at the Swarm booth, put it in `SWARM_BATCH_ID`, repeat this part, and write the
batch and one reference into `arkiv/swarm.md`.

## Part 14: An AI agent

A cafe's agent buys from Chai Point by itself over x402. It needs Parts 9 and 10 done, with the
store running and its webhook set up.

**Set it up.** This makes the agent's wallet, saves the key in `apps/agent/.env` and prints the
address.

```bash
pnpm agent:wallet
```

| Do this | You should see |
|---|---|
| In Settle, open **Account** and send 10 USDT to that address | "Sent." |
| Copy `apps/agent/.env.example` into `apps/agent/.env`, keeping the `AGENT_KEY` line | `STORE_URL` is the store, `STORE_ADDRESS` is the store's Key ID, `SETTLE_URL` is Settle. |

**Run the full check.** No AI is involved. It makes one real purchase of 1.25 USDT.

```bash
pnpm agent:check
```

It prints 20 lines starting PASS, then `EVERYTHING PASSED` and a proof link. They cover:

| Group | You should see |
|---|---|
| Setup | The agent holds no WBT, and the store and Settle answer. |
| Refused, costing nothing | No payment, a changed amount, too little, the wrong recipient, an expired signature, garbage, and a forged signature. |
| The agent's own limit | A price over its cap is never signed. |
| A real purchase | It goes through, the agent pays exactly 1.25, and it still holds no WBT. |
| Retries | The same request again isn't charged and returns the same order. |

**Run the agent.** Add `ANTHROPIC_API_KEY` to `apps/agent/.env` first.

```bash
pnpm agent:start
```

| Do this | You should see |
|---|---|
| Run the command | The agent's address, its USDT, and `0 WBT`. |
| Watch the terminal | It reads the stockroom and the catalog, orders 3 of masala, and prints `The store answered 402`, then `200`, then a proof link. |
| Look at the end | A short summary, and 4.50 USDT less in its wallet, still with `0 WBT`. |
| Look at the store's terminal | `Ship order chai-…`. |
| Merchant: open **Invoices** | Under **Agent sales**: "3 x Masala chai blend", 4.50 USDT, what you received after the network fee, and a proof link. **Collected** went up. |
| Press **Export CSV** | A row with status `Agent sale`. |
| Open **Developers** | An `order.paid` row marked "Delivered · 200". |
| Open the proof link | One transaction with two USDT transfers: the agent to the store, and the store to the relayer for gas. |
| Open the agent's address on the explorer | No transactions sent from it, and 0 WBT. Its USDT moved under Token transfers. |

**Live:** run `pnpm agent:check` against the deployed addresses first, then record `pnpm agent:start`
for the video. Save the proof link for the README.

## Part 15: A browser wallet

Skip this if you only want the email path. Use MetaMask or Rabby on Whitechain Sepolia.

| Do this | You should see |
|---|---|
| Log in with **Browser wallet** | Your wallet asks to connect. The header shows your short address. |
| On Invoices, press **Show customer details** | One signature request. It costs no gas. Customer names then appear. |
| Pay an invoice | One signature request, no gas. Or tick "Pay the gas from my wallet in WBT instead" to send two normal transactions. |

## Part 16: On a phone

Open the app on your phone, or use your browser's phone view.

| Do this | You should see |
|---|---|
| Open the dashboard | A menu along the bottom with five items. Invoices show as cards, not a table. |
| Open a pay link | The amount and the Pay button fit without scrolling sideways. |
| Open the demo store and buy | Checkout opens in a new tab instead of a small window, then you are back on the store with the order confirmed. |

## If something goes wrong

| You see | Why | Fix |
|---|---|---|
| "The test money has run out for now." | The relayer has no test USDT. | Send it some. See "Before you start". |
| "You've had today's test money." | That account already used today's top-up. | Use another email. |
| No "Add test USDT" button, only a QR code | `DEMO_TOPUP_USDT` is not set. | Add it and restart. |
| "Settle can't send transactions right now." | The relayer is below 0.005 WBT, or gas is above 50 gwei. | Check `/api/relay/health`. |
| Email login fails on the deployed site | The login provider doesn't know that address. | Add the domain in the Privy dashboard. |
| "Reveal key secret" shows an error | Wallet export is turned off. | Allow it in the Privy dashboard. |
| The store says "We couldn't start your order." | Wrong keys, or the account has 5 unpaid orders and has never been paid. | Check `apps/shop/.env`. Pay or cancel an order. |
| "Enter a public https address." when saving a webhook | Local addresses are refused unless `WEBHOOK_ALLOW_LOCAL=true`. | Set it locally only. |
| "Too many requests." | More than 30 requests a minute from one address. | Wait a minute. |
| Customer names show as "Hidden" | A wallet account hasn't signed in yet. | Press **Show customer details**. |
| `Set AGENT_KEY in apps/agent/.env` | The agent has no wallet or settings yet. | Run `pnpm agent:wallet` and fill in the file. |
| `over_the_agent_limit` | The price is above `MAX_PER_PAYMENT`, or the store isn't `STORE_ADDRESS`. | Raise the limit, or fix the address. |
| `insufficient_funds` from the agent | Its wallet has too little USDT. | Send it more from the Account page. |
| `payment_in_progress` | A payment for that order is still valid. | Wait two minutes. It may yet go through. |
| "Email from Settle is in test mode…" | Resend only delivers to its own account's address until a domain is verified. | Use the mail app or copy options, or verify a domain and set `REMINDER_FROM`. |
| `Set SETTLE_BASE_URL, SETTLE_KEY_ID and SETTLE_KEY_SECRET…` | The SDK example found no keys. | Fill in `apps/shop/.env`, as in Part 10. |
| `Stopped: Couldn't reach Settle. (network)` | The app isn't running, or `SETTLE_BASE_URL` is wrong. | Start the app. Check the address in `apps/shop/.env`. |
| `Set ARKIV_ACCESS_KEY.` | The Arkiv query found no access key. | Run it with `--env-file=apps/web/.env`, as written. |
| No PDF field on the new invoice form | `SWARM_BEE_URL` or `SWARM_BATCH_ID` is empty. | Set both and restart. |
| The Swarm address answers "not found" | The public gateway dropped the file. | Attach a PDF to a new invoice. A postage batch of your own stops this. |

## What was checked automatically

These ran on a local copy of Whitechain Sepolia with the real test USDT.

| Suite | Checks |
|---|---|
| Contracts | 132 |
| The whole app through its screens | 49 |
| Demo store with the app | 26 |
| Settle Checkout, including blocked popups and fake messages | 29 |
| SDK installed in a project outside this repo | 56 |
| Webhooks, including failing servers and forgeries | 61 |
| The store receiving a real webhook | 5 |
| The SDK example from a terminal, paid and refunded | 5 |
| A PDF from the form to Swarm and back, for four kinds of visitor | 7 |
| Starting fresh on New invoice and New plan | 7 |
| The receipt link, every answer the email service can give, and a subscription's record | 32 |
| Agent payments through a real store: the check in Part 14 | 20 |
| The facilitator: the standard client, attacks on the relayer, races, webhooks | 24 |
| Settle killed with the payment on-chain, then the same order repeated | 7 |
| An empty relayer, an Arkiv write failing, and a log server running behind | 11 |
| Agent sales on the dashboard, CSV, Developers, docs and store, on desktop and phone | 11 |

The commands in Parts 11, 12 and 13 were each run as written. For one test PDF of 193 bytes,
Swarm held 221 bytes that did not start with `%PDF`, and the Arkiv query did not contain the
customer's name or address.

## What only you can check

- Everything marked **Email only**, above all "Reveal key secret".
- The agent with real Claude. Its full run was tested against a stand-in for the model, so every
  tool and payment was real but the model's decisions weren't.
- An agent payment on the live chain.
- Opening a PDF as the email customer it was sent to. Only wallet customers were checked.
- Real MetaMask or Rabby popups.
- Safari and a real phone.
- Anything on the live chain. Nobody has subscribed there yet.
- Real email delivery through Resend.
