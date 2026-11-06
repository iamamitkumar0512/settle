import Link from "next/link";
import type { ReactNode } from "react";
import { SHOP_NAME } from "./products";

// A demo shop that takes payment through Settle's SDK. It isn't part of the Settle app.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="theme-root flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[68px] max-w-[1040px] flex-wrap items-center justify-between gap-3 px-4 py-2 md:px-8">
          <Link href="/shop" className="display text-xl">
            {SHOP_NAME}
          </Link>
          <span className="pill">Demo shop · payments by Settle</span>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[1040px] flex-1 flex-col px-4 py-10 md:px-8">
        {children}
      </div>
      <footer className="p-4 text-center text-[13px]/[18px] text-muted">
        Sample products. Nothing ships. Payments are real USDT on the Whitechain testnet.
      </footer>
    </div>
  );
}
