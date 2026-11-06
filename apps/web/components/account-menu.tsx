"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUsdt } from "@/lib/format";
import { useSession } from "@/lib/use-session";
import { useUsdtBalance } from "@/lib/use-usdt-balance";

export function AccountMenu() {
  const session = useSession();
  const { data: balance } = useUsdtBalance(session.address);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (session.status !== "ready" || !session.address) return null;
  const address = session.address;

  async function copyAddress() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className={`btn max-w-[220px] ${session.email ? "" : "figure"}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{session.label}</span> ▾
      </button>
      {open && (
        <div
          role="group"
          aria-label="Your account"
          className="card absolute right-0 top-full z-10 mt-2 flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-3 p-4 shadow-2xl"
        >
          {session.email && (
            <div className="flex justify-between gap-4">
              <span className="text-muted">Email</span>
              <span className="min-w-0 truncate">{session.email}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted">Balance</span>
            <span className="figure">
              {balance === undefined ? "—" : `${formatUsdt(balance)} USDT`}
            </span>
          </div>
          <div>
            <div className="text-muted">Wallet address</div>
            <div className="figure mt-0.5 text-[13px]/[18px] break-all">{address}</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={copyAddress}>
              {copied ? "Copied" : "Copy address"}
            </button>
            <Link href="/account" className="btn flex-1" onClick={() => setOpen(false)}>
              Account
            </Link>
          </div>
          <button type="button" className="btn text-late" onClick={session.logout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
