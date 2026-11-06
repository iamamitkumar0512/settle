import Link from "next/link";
import { Logo } from "./logo";

const DEMO_STORE = process.env.NEXT_PUBLIC_DEMO_STORE_URL;

// The header on pages anyone can read without logging in.
export function SiteHeader() {
  return (
    <header className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center justify-between gap-3 px-4 md:px-8">
      <Logo />
      <nav aria-label="Main" className="flex items-center gap-2">
        {DEMO_STORE && (
          <a href={DEMO_STORE} className="btn hidden sm:inline-flex">
            Demo store
          </a>
        )}
        <Link href="/docs" className="btn">
          Docs
        </Link>
        <Link href="/dashboard" className="btn btn-primary">
          Dashboard
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-line p-6 text-center text-[13px]/[18px] text-muted">
      <span>Settle · Built for ETHGlobal Mumbai 2026 · Testnet</span>
      <Link href="/docs" className="text-accent-text">
        Docs
      </Link>
      <a
        href="https://github.com/iamamitkumar0512/settle"
        target="_blank"
        rel="noreferrer"
        className="text-accent-text"
      >
        Source on GitHub
      </a>
    </footer>
  );
}
