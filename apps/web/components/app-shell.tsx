"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useSession } from "@/lib/use-session";
import { AccountMenu } from "./account-menu";
import { FinishSetup } from "./finish-setup";
import { LoginCard } from "./login-card";
import { Logo } from "./logo";
import { SwitchNetwork } from "./switch-network";

const NAV = [
  { href: "/dashboard", label: "Invoices" },
  { href: "/plans", label: "Plans" },
  { href: "/pay", label: "To pay" },
  { href: "/account", label: "Account" },
];

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto">
      {NAV.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex h-10 items-center rounded-lg px-3 font-medium whitespace-nowrap ${
              current ? "bg-raised text-ink" : "text-muted"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// The current page is only known at request time, so the links render first without it.
function Nav() {
  return <NavLinks pathname={usePathname()} />;
}

function Gate({ children }: { children: ReactNode }) {
  const session = useSession();

  if (session.status === "loading") {
    return <p className="m-auto text-muted">Loading…</p>;
  }
  if (session.status === "signedOut") {
    return (
      <section className="card m-auto w-full max-w-[420px] p-6">
        <LoginCard title="Log in to Settle" />
      </section>
    );
  }
  if (session.status === "needsWallet") {
    return (
      <section className="card m-auto w-full max-w-[420px] p-6">
        <FinishSetup />
      </section>
    );
  }
  if (!session.isOnWhitechain) {
    return (
      <section className="card m-auto w-full max-w-[420px] p-6">
        <SwitchNetwork />
      </section>
    );
  }
  return children;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[68px] max-w-[1376px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 md:px-8">
          <Logo />
          <Suspense fallback={<NavLinks pathname="" />}>
            <Nav />
          </Suspense>
          <div className="ml-auto">
            <AccountMenu />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col px-4 py-8 md:px-8">
        <Gate>{children}</Gate>
      </div>
    </>
  );
}
