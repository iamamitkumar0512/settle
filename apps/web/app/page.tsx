import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { whitechainSepolia } from "@/lib/chains";
import { REGISTRY_ADDRESS } from "@/lib/contracts";
import { ChainStatus, LiveFee } from "./chain-status";

const EXPLORER = whitechainSepolia.blockExplorers.default.url;
const DEMO_STORE = process.env.NEXT_PUBLIC_DEMO_STORE_URL;

const CODE = `const order = await settle.orders.create({
  amount: "3.00",
});

new Settle.Checkout({
  orderId: order.id,
  handler: confirmOnServer,
}).open();`;

const COMPARISON = [
  { row: "Fee on a 1,000 sale", card: "About 30, at 3%", settle: null },
  { row: "Money arrives", card: "In days", settle: "In seconds" },
  { row: "Chargebacks", card: "Yes", settle: "None. Refunds are yours to give" },
  { row: "Customers abroad", card: "Currency conversion", settle: "The same USDT everywhere" },
];

const AFTER_PAYMENT = [
  { title: "Refunds", text: "In part or in full, from the dashboard or your code. They show on the receipt." },
  { title: "Subscriptions", text: "A customer approves once, is billed on schedule and can cancel any time." },
  { title: "Reminders", text: "Customers see what is due. You can nudge them, and they can add it to a calendar." },
  { title: "Webhooks", text: "Your server is told about each order and refund, signed by Settle." },
  { title: "Receipts", text: "A permanent receipt for every payment, with proof anyone can check." },
  { title: "Accounting export", text: "One CSV with every payment, fee and refund." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-4 pt-10 pb-16 md:px-8 md:pt-[72px] md:pb-[88px] lg:grid-cols-[6fr_5fr] lg:gap-16">
          <div>
            <span className="pill tone-due mb-5">Test mode on Whitechain Sepolia</span>
            <h1 className="display text-[44px]/[48px] tracking-tight md:text-[68px]/[72px]">
              The payment gateway for USDT.
            </h1>
            <p className="mt-6 mb-8 max-w-[34em] text-[17px]/7 text-muted md:text-[19px]/[30px]">
              Add checkout to your website in about 20 lines, or send an invoice with no code at all.
              Your customer pays with an email address. There&apos;s no wallet to install and nothing
              to buy first.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard" className="btn btn-primary min-h-[52px] px-[22px] text-base">
                Start getting paid
              </Link>
              <Link href="/docs" className="btn min-h-[52px] px-[22px] text-base">
                Add to your website
              </Link>
            </div>
          </div>

          <div data-theme="light" className="theme-root rounded-[20px] p-4 md:p-7">
            <div className="card flex flex-col gap-4 p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="display text-lg">Live on {whitechainSepolia.name}</span>
                <span className="pill tone-paid">Verified</span>
              </div>
              <div className="well flex flex-col gap-2 text-[13px]/[18px]">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted">Payment contract</span>
                  <a
                    href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                    className="figure whitespace-nowrap text-accent-text"
                  >
                    {REGISTRY_ADDRESS.slice(0, 6)}…{REGISTRY_ADDRESS.slice(-4)} ↗
                  </a>
                </div>
                <ChainStatus />
              </div>
              <p className="text-[13px]/[18px] text-muted">
                Money goes straight to you. The contract keeps nothing, and it has no owner.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line px-4 py-16 md:px-8 md:py-[72px]">
          <div className="mx-auto max-w-[1176px]">
            <h2 className="display mb-8 text-[28px]/9 md:text-4xl/11">Three ways to get paid</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <article className="card flex min-w-0 flex-col gap-4 p-6">
                <h3 className="display text-xl">On your website</h3>
                <p className="text-muted">
                  Install the SDK, create an order on your server and open Settle Checkout from your
                  page. It works the way a card gateway does, and your customer stays on your site.
                </p>
                <pre className="well min-w-0 overflow-x-auto text-[13px]/[20px]">
                  <code>{CODE}</code>
                </pre>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link href="/docs" className="btn btn-primary">
                    Read the docs
                  </Link>
                  <Link href="/developers" className="btn">
                    Get your keys
                  </Link>
                  {DEMO_STORE && (
                    <a href={DEMO_STORE} className="btn">
                      Try a live store
                    </a>
                  )}
                </div>
              </article>
              <article className="card flex min-w-0 flex-col gap-4 p-6">
                <h3 className="display text-xl">With a link</h3>
                <p className="text-muted">
                  No website needed. Create an invoice or a subscription plan in your dashboard,
                  share the link, and see who has paid.
                </p>
                <ol className="flex flex-col gap-3">
                  {[
                    "Create an invoice with an amount and a due date",
                    "Send your customer its link",
                    "They pay with an email address",
                  ].map((step, index) => (
                    <li key={step} className="well flex items-center gap-3">
                      <span className="figure text-muted">0{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="mt-auto">
                  <Link href="/dashboard/new" className="btn btn-primary">
                    Create an invoice
                  </Link>
                </div>
              </article>
              <article className="card flex min-w-0 flex-col gap-4 p-6 md:col-span-2">
                <h3 className="display text-xl">From AI agents</h3>
                <p className="text-muted">
                  Put a price on one route, and an AI agent can buy from you with no account, no API
                  key and no gas. It pays over x402, and you get a normal order.
                </p>
                <ol className="grid gap-3 md:grid-cols-3">
                  {[
                    "An agent asks to buy and gets your price",
                    "It pays in USDT, within the limit its owner set",
                    "The order lands in your dashboard and webhook",
                  ].map((step, index) => (
                    <li key={step} className="well flex items-center gap-3">
                      <span className="figure text-muted">0{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div>
                  <Link href="/docs#agents" className="btn">
                    See how it works
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="border-t border-line px-4 py-16 md:px-8 md:py-[72px]">
          <div className="mx-auto max-w-[1176px]">
            <h2 className="display mb-2 text-[28px]/9 md:text-4xl/11">
              A flat fee, not a percentage
            </h2>
            <p className="mb-8 max-w-[40em] text-muted">
              Settle adds no fee of its own. A small network fee repays the cost of sending the
              payment, and it is the same on any amount.
            </p>
            <ul aria-label="Settle compared with a typical card gateway" className="card md:hidden">
              {COMPARISON.map(({ row, card, settle }) => (
                <li key={row} className="flex flex-col gap-2 border-t border-line p-5 first:border-t-0">
                  <div className="font-semibold">{row}</div>
                  <div className="flex justify-between gap-4 text-[13px]/[18px]">
                    <span className="text-muted">Card gateway</span>
                    <span className="text-right text-muted">{card}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-[13px]/[18px]">
                    <span className="text-muted">Settle</span>
                    <span className={`text-right ${settle ? "" : "figure text-accent-text"}`}>
                      {settle ?? <LiveFee />}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="card hidden overflow-x-auto md:block">
              <table className="data-table compare-table">
                <caption className="sr-only">Settle compared with a typical card gateway</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Compared</span>
                    </th>
                    <th scope="col" className="label">
                      Typical card gateway
                    </th>
                    <th scope="col" className="label">
                      Settle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map(({ row, card, settle }) => (
                    <tr key={row}>
                      <th scope="row">{row}</th>
                      <td className="text-muted">{card}</td>
                      <td className={settle ? "" : "figure text-accent-text"}>
                        {settle ?? <LiveFee />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-line px-4 py-16 md:px-8 md:py-[72px]">
          <div className="mx-auto max-w-[1176px]">
            <h2 className="display mb-8 text-[28px]/9 md:text-4xl/11">
              Everything after the first payment
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {AFTER_PAYMENT.map(({ title, text }) => (
                <li key={title} className="card p-6">
                  <h3 className="display mb-1.5 text-xl">{title}</h3>
                  <p className="text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
