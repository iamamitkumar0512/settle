"use client";

import { useConnection } from "wagmi";
import { WalletButton } from "@/components/wallet-button";
import { whitechainSepolia } from "@/lib/chains";

export function InvoicesPanel() {
  const { chainId, status } = useConnection();

  if (status !== "connected") {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">Connect your wallet</h2>
        <p className="text-muted">Your wallet is your merchant account on Settle.</p>
        <WalletButton />
      </section>
    );
  }

  if (chainId !== whitechainSepolia.id) {
    return (
      <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="display text-xl">Switch to Whitechain</h2>
        <p className="text-muted">Settle runs on {whitechainSepolia.name}.</p>
        <WalletButton />
      </section>
    );
  }

  return (
    <section className="card px-6 py-16 text-center">
      <h2 className="display text-xl">No invoices yet</h2>
      <p className="mt-1 text-muted">Invoices you create will appear here.</p>
    </section>
  );
}
