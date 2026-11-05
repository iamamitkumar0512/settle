"use client";

import { useEffect, useRef, useState } from "react";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { whitechainSepolia } from "@/lib/chains";
import { shortAddress } from "@/lib/format";

function connectErrorMessage(error: Error) {
  if (error.name === "ProviderNotFoundError") {
    return "No wallet found. Install MetaMask or Rabby, then try again.";
  }
  if (error.name === "UserRejectedRequestError") {
    return "Connection cancelled.";
  }
  return "Could not connect. Check your wallet and try again.";
}

export function WalletButton() {
  const { address, chainId, status } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const disconnect = useDisconnect();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (status === "connecting" || status === "reconnecting") {
    return (
      <button type="button" className="btn" disabled>
        Connecting…
      </button>
    );
  }

  if (status === "disconnected" || !address) {
    return (
      <div className="relative">
        <button
          type="button"
          className="btn btn-primary"
          disabled={connect.isPending}
          onClick={() => connect.mutate({ connector: connectors[0] })}
        >
          {connect.isPending ? "Check your wallet" : "Connect wallet"}
        </button>
        {connect.error && (
          <p
            role="alert"
            className="card absolute right-0 top-full z-10 mt-2 w-64 p-3 text-[13px]/[18px] text-late"
          >
            {connectErrorMessage(connect.error)}
          </p>
        )}
      </div>
    );
  }

  if (chainId !== whitechainSepolia.id) {
    return (
      <div className="relative flex items-center gap-2">
        <span className="pill tone-due hidden sm:inline-flex">Wrong network</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={switchChain.isPending}
          onClick={() => switchChain.mutate({ chainId: whitechainSepolia.id })}
        >
          {switchChain.isPending ? "Check your wallet" : "Switch to Whitechain"}
        </button>
        {switchChain.error && (
          <p
            role="alert"
            className="card absolute right-0 top-full z-10 mt-2 w-64 p-3 text-[13px]/[18px] text-late"
          >
            Could not switch network. Add Whitechain Sepolia in your wallet and try again.
          </p>
        )}
      </div>
    );
  }

  async function copyAddress(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const explorerUrl = `${whitechainSepolia.blockExplorers.default.url}/address/${address}`;

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      <span className="pill tone-paid hidden sm:inline-flex">
        {whitechainSepolia.name}
      </span>
      <button
        type="button"
        className="btn figure"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {shortAddress(address)}
      </button>
      {menuOpen && (
        <div
          role="menu"
          aria-label="Wallet"
          className="card absolute right-0 top-full z-10 mt-2 flex w-72 flex-col p-2 shadow-2xl"
        >
          <p className="figure break-all px-3 py-2 text-[13px]/[18px] text-muted">{address}</p>
          <button
            type="button"
            role="menuitem"
            className="min-h-11 rounded-lg px-3 text-left hover:bg-sunken"
            onClick={() => copyAddress(address)}
          >
            {copied ? "Address copied" : "Copy address"}
          </button>
          <a
            role="menuitem"
            className="flex min-h-11 items-center rounded-lg px-3 hover:bg-sunken"
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer ↗
          </a>
          <button
            type="button"
            role="menuitem"
            className="min-h-11 rounded-lg px-3 text-left text-late hover:bg-sunken"
            onClick={() => {
              setMenuOpen(false);
              disconnect.mutate({});
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
