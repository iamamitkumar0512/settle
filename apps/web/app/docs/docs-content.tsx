"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/code-block";
import {
  AGENT_CLIENT_CODE,
  AGENT_SERVER_CODE,
  browserCode,
  REFUND_CODE,
  serverCode,
  WEBHOOK_CODE,
} from "@/lib/integration-snippets";
import { useSiteOrigin } from "@/lib/use-site-origin";

const STEPS = [
  { id: "install", title: "Install" },
  { id: "keys", title: "Get your keys" },
  { id: "order", title: "Create an order" },
  { id: "checkout", title: "Open checkout" },
  { id: "verify", title: "Verify the payment" },
  { id: "webhooks", title: "Webhooks" },
  { id: "agents", title: "Sell to AI agents" },
  { id: "more", title: "Refunds and links" },
  { id: "reference", title: "Reference" },
];

const CHECKOUT_OPTIONS = [
  ["orderId", "An order's id, or a function that creates the order and gives its id. Required."],
  ["handler(response)", "Runs after payment with settle_order_id and settle_payment_id."],
  ["onDismiss()", "Runs when the customer closes checkout without paying."],
  ["onError(error)", "Runs when your orderId function fails."],
  ["redirect", "true skips the window and uses the whole page."],
];

const EVENTS = [
  ["order.paid", "An order is paid, by any route.", "orderId, paymentId, amount, received, networkFee, receipt, payer, receiptUrl"],
  ["refund.created", "You refund, in part or in full.", "orderId, refundId, amount, totalRefunded, receipt, payer, receiptUrl"],
  ["webhook.test", "You press Send test event.", "message"],
];

const CALLS = [
  ["orders.create(order)", "Creates an order to pay at checkout."],
  ["orders.fetch(id)", "One of your orders, read from the chain."],
  ["orders.all()", "All your orders and payment links, newest first."],
  ["orders.cancel(id)", "Cancels an order nobody has paid."],
  ["payments.verify(response)", "Confirms a payment against Whitechain."],
  ["refunds.create({ orderId, amount })", "Refunds in part, or in full with no amount."],
  ["paymentLinks.create(link)", "An invoice with a due date and a link to share."],
  ["agents.charge(request, price)", "Puts a price on a route, so AI agents can buy over x402."],
  ["webhooks.verify(body, signature, secret)", "Checks a webhook came from Settle."],
  ["account.balance()", "This account's USDT."],
  ["account.withdraw({ to, amount })", "Sends USDT to any address, with no gas."],
  ["fees()", "Current network fees and the smallest order."],
];

const ERRORS = [
  ["order_not_paid", "The order hasn't been paid."],
  ["payment_mismatch", "That payment didn't pay this order."],
  ["not_your_order", "The order belongs to another account."],
  ["invalid_amount", "Not a positive amount with up to 6 decimals."],
  ["invoice_too_small", "Below the smallest order. See fees()."],
  ["RefundTooLarge", "More than can still be refunded."],
  ["too_many_requests", "Over 30 requests a minute from one address."],
];

function Section({ id, step, title, children }: { id: string; step?: number; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex min-w-0 scroll-mt-6 flex-col gap-3">
      <h2 id={`${id}-title`} className="display text-2xl">
        {step !== undefined && <span className="figure mr-3 text-base text-muted">0{step}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="data-table docs-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label} scope="col" className="label">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest]) => (
            <tr key={first}>
              <td className="figure text-[13px]/[18px]">{first}</td>
              {rest.map((cell) => (
                <td key={cell} className="text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocsContent({ demoStore }: { demoStore?: string }) {
  const site = useSiteOrigin() || "https://<your Settle>";

  return (
    <main className="mx-auto grid w-full max-w-[1240px] flex-1 gap-10 px-4 pt-8 pb-16 md:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
      <nav aria-label="On this page" className="hidden lg:block">
        <ol className="sticky top-6 flex flex-col gap-1 border-l border-line">
          {STEPS.map(({ id, title }) => (
            <li key={id}>
              <a href={`#${id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-muted hover:border-accent-text hover:text-ink">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex min-w-0 max-w-[760px] flex-col gap-12">
        <div className="flex flex-col items-start gap-4">
          <span className="pill tone-due">Test mode on Whitechain Sepolia</span>
          <h1 className="display text-[40px]/[44px] tracking-tight md:text-[52px]/[56px]">
            Add Settle to your website
          </h1>
          <p className="text-[17px]/7 text-muted">
            Settle works the way a card gateway does. Your server creates an order, Settle Checkout
            opens over your page, and your server confirms the payment. Your customer pays in USDT
            with an email address, and needs no wallet and no gas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/developers" className="btn btn-primary">
              Get your keys
            </Link>
            {demoStore && (
              <a href={demoStore} className="btn">
                Try the demo store
              </a>
            )}
          </div>
        </div>

        <Section id="install" step={1} title="Install">
          <p className="text-muted">The SDK runs on your server, on Node 20 or later.</p>
          <CodeBlock code="npm install settle-pay" label="Copy command" />
        </Section>

        <Section id="keys" step={2} title="Get your keys">
          <p className="text-muted">
            Log in to Settle and open{" "}
            <Link href="/developers" className="text-accent-text">
              Developers
            </Link>
            . Your Key ID is public. Your Key Secret can move your account&apos;s money, like a card
            gateway&apos;s secret key, so keep it on your server and use one Settle account per
            store. Settle never sees or stores it.
          </p>
        </Section>

        <Section id="order" step={3} title="Create an order">
          <p className="text-muted">
            Create the order on your server when the customer clicks Buy. <code className="figure text-ink">receipt</code>{" "}
            is your own order number: only you can read it, and it comes back when the order is paid.
          </p>
          <CodeBlock code={serverCode("process.env.SETTLE_KEY_ID", site)} label="Copy server code" />
        </Section>

        <Section id="checkout" step={4} title="Open checkout">
          <p className="text-muted">
            Load <code className="figure text-ink">checkout.js</code> and open checkout from a click.
            It opens in its own window, so your customer stays on your page. If a browser blocks
            the window, the whole page goes to Settle and comes back to the order&apos;s{" "}
            <code className="figure text-ink">callbackUrl</code>.
          </p>
          <CodeBlock code={browserCode(site)} label="Copy page code" />
          <Table caption="Checkout options" head={["Option", "What it does"]} rows={CHECKOUT_OPTIONS} />
        </Section>

        <Section id="verify" step={5} title="Verify the payment">
          <p className="text-muted">
            Never trust the browser on its own. <code className="figure text-ink">payments.verify</code>{" "}
            reads Whitechain, not Settle. It throws unless the payment exists, paid that order, and
            the order is yours. It needs no shared secret, because the chain is the proof. The
            result includes what reached you after the network fee, your order number, and a link
            to your customer&apos;s receipt.
          </p>
        </Section>

        <Section id="webhooks" step={6} title="Webhooks">
          <p className="text-muted">
            A webhook reaches your server even if your customer closes their browser. Add your
            address on the Developers page and copy its signing secret. Answer with any 2xx
            status. Settle tries 3 times, and a failed delivery can be resent from the Developers
            page. An event can arrive more than once, so use its id to act only once.
          </p>
          <CodeBlock code={WEBHOOK_CODE} label="Copy webhook code" />
          <Table caption="Webhook events" head={["Event", "Sent when", "Its data holds"]} rows={EVENTS} />
        </Section>

        <Section id="agents" title="Sell to AI agents">
          <p className="text-muted">
            Agents can buy from you too, with no checkout page. Put a price on a route: an agent that
            calls it gets a 402 with the price, pays over x402, and repeats the request. It needs no
            account, no API key and no gas, and any standard x402 client works.
          </p>
          <CodeBlock code={AGENT_SERVER_CODE} label="Copy server code" />
          <CodeBlock code={AGENT_CLIENT_CODE} label="Copy agent code" />
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted">
            <li>
              Each order lands in your dashboard under Agent sales, in your CSV export, and at your
              webhook as <code className="figure text-ink">order.paid</code> with{" "}
              <code className="figure text-ink">agent: true</code>.
            </li>
            <li>
              Build the order number from an id the agent sends. A retry with the same id gets the
              same order back and is never charged twice.
            </li>
            <li>The network fee comes out of the sale, in the same transaction.</li>
            <li>
              An agent pays you directly, so its order has no refund button. To refund one, send the
              money back from your Account page.
            </li>
            <li>
              The cap above is per payment. An agent&apos;s total budget is what its wallet holds.
            </li>
          </ul>
        </Section>

        <Section id="more" title="Refunds and payment links">
          <p className="text-muted">
            A refund goes back to whoever paid and shows on their receipt. Everything you make with
            the SDK also appears in your Settle dashboard, where you can refund and export it.
          </p>
          <CodeBlock code={REFUND_CODE} label="Copy code" />
        </Section>

        <Section id="reference" title="Reference">
          <Table caption="Everything you can call" head={["Call", "What it does"]} rows={CALLS} />
          <h3 className="display mt-4 text-xl">Errors</h3>
          <p className="text-muted">
            A failed call throws <code className="figure text-ink">SettleError</code>. Its message
            says what went wrong, and its code is stable, so you can branch on it.
          </p>
          <Table caption="Common error codes" head={["Code", "Meaning"]} rows={ERRORS} />
          <h3 className="display mt-4 text-xl">Fees and limits</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted">
            <li>Settle adds no fee. A flat network fee repays the cost of sending each payment.</li>
            <li>The smallest order is 1 USDT.</li>
            <li>A new account can hold 5 unpaid orders until its first payment arrives.</li>
            <li>An account can create 50 orders a day, and send 30 requests a minute.</li>
            <li>This is a test version on Whitechain Sepolia. Customers can add free test USDT.</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}
