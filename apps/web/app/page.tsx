import Link from "next/link";
import { Logo } from "@/components/logo";
import { whitechainSepolia } from "@/lib/chains";
import { REGISTRY_ADDRESS } from "@/lib/contracts";
import { ChainStatus } from "./chain-status";

const EXPLORER = whitechainSepolia.blockExplorers.default.url;

const STEPS = [
  {
    title: "Send a link",
    text: "Create an invoice with an amount and a due date, then share its pay link.",
  },
  {
    title: "They pay by email",
    text: "No wallet to install and no gas to buy. USDT reaches your wallet directly.",
  },
  {
    title: "Refund any time",
    text: "Refund in part or in full. The customer sees it on the same receipt.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center justify-between px-4 md:px-8">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-2">
          <Link href="/pay" className="btn">
            My invoices
          </Link>
          <Link href="/dashboard" className="btn btn-primary">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-4 pt-10 pb-16 md:px-8 md:pt-[72px] md:pb-[88px] lg:grid-cols-[6fr_5fr] lg:gap-16">
          <div>
            <h1 className="display text-[44px]/[48px] tracking-tight md:text-[68px]/[72px]">
              Get paid in USDT. Your customer never sees crypto.
            </h1>
            <p className="mt-6 mb-8 max-w-[34em] text-[17px]/7 text-muted md:text-[19px]/[30px]">
              Invoices, pay links and refunds on Whitechain. Customers pay with an email. You cover
              the gas, and only for your own payments.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/new" className="btn btn-primary min-h-[52px] px-[22px] text-base">
                Create an invoice
              </Link>
              <Link href="/pay" className="btn min-h-[52px] px-[22px] text-base">
                Pay an invoice
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
                  <span className="text-muted">Invoice contract</span>
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
                The contract never holds your money, and it has no owner.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line px-4 py-16 md:px-8 md:py-[72px]">
          <div className="mx-auto max-w-[1176px]">
            <h2 className="display mb-8 text-[28px]/9 md:text-4xl/11">From invoice to refund</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="card p-6">
                  <div className="figure text-muted">0{index + 1}</div>
                  <h3 className="display mt-3 mb-1.5 text-xl">{step.title}</h3>
                  <p className="text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-line p-6 text-center text-[13px]/[18px] text-muted">
        Settle · Built for ETHGlobal Mumbai 2026 · Testnet
      </footer>
    </div>
  );
}
