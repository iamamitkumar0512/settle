import Link from "next/link";
import { Logo } from "./logo";
import { WalletButton } from "./wallet-button";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-[68px] max-w-[1376px] items-center gap-6 px-4 md:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden md:block">
          <Link
            href="/dashboard"
            aria-current="page"
            className="inline-flex h-10 items-center rounded-lg bg-raised px-3 font-medium"
          >
            Invoices
          </Link>
        </nav>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
