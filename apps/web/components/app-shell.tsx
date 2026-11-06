"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { usePendingInvoices } from "@/lib/use-customer-invoices";
import { useSession } from "@/lib/use-session";
import { AccountMenu } from "./account-menu";
import { FinishSetup } from "./finish-setup";
import { LoginCard } from "./login-card";
import { Logo } from "./logo";
import { PaymentReminders } from "./payment-reminders";
import { SwitchNetwork } from "./switch-network";

const NAV = [
  { href: "/dashboard", label: "Invoices", icon: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" },
  { href: "/plans", label: "Plans", icon: "M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5" },
  { href: "/pay", label: "To pay", icon: "M3 7h18v11H3zM3 11h18M7 15h3" },
  { href: "/account", label: "Account", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0" },
  { href: "/developers", label: "Developers", icon: "M9 8l-4 4 4 4M15 8l4 4-4 4" },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// How many invoices this account still has to pay, coloured when one is overdue or due soon.
function ToPayCount({ compact }: { compact?: boolean }) {
  const { open, urgent } = usePendingInvoices();
  if (open.length === 0) return null;

  const tone = urgent.some(({ state }) => state.isOverdue)
    ? "tone-late"
    : urgent.length > 0
      ? "tone-due"
      : "";
  return (
    <span
      className={`pill before:hidden ${tone} ${compact ? "absolute -top-1 left-1/2 ml-1 h-[18px] px-1.5 text-[11px]" : "ml-2"}`}
    >
      {open.length}
      <span className="sr-only"> unpaid</span>
    </span>
  );
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden gap-1 lg:flex">
      {NAV.map(({ href, label }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`inline-flex h-10 items-center rounded-lg px-3 font-medium whitespace-nowrap hover:text-ink ${
              current ? "bg-raised text-ink" : "text-muted"
            }`}
          >
            {label}
            {href === "/pay" && (
              // The count depends on the time of day, so it only ever renders in the browser.
              <Suspense fallback={null}>
                <ToPayCount />
              </Suspense>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main on phones"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV.map(({ href, label, icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]/[14px] font-medium ${
              current ? "text-accent-text" : "text-muted"
            }`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={icon} />
            </svg>
            {label}
            {href === "/pay" && (
              <Suspense fallback={null}>
                <ToPayCount compact />
              </Suspense>
            )}
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

function PhoneNav() {
  return <TabBar pathname={usePathname()} />;
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
  return (
    <>
      <Suspense fallback={null}>
        <PaymentReminders />
      </Suspense>
      {children}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-[68px] max-w-[1376px] items-center gap-3 px-4 md:gap-6 md:px-8">
          <Logo />
          <span className="pill tone-due">Test mode</span>
          <Suspense fallback={<NavLinks pathname="" />}>
            <Nav />
          </Suspense>
          <div className="ml-auto min-w-0">
            <AccountMenu />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col px-4 pt-6 pb-24 md:px-8 lg:py-8">
        <Gate>{children}</Gate>
      </div>
      <Suspense fallback={<TabBar pathname="" />}>
        <PhoneNav />
      </Suspense>
    </>
  );
}
