"use client";

import { WalletGate } from "@/components/wallet-gate";

export function InvoicesPanel() {
  return (
    <WalletGate>
      <section className="card px-6 py-16 text-center">
        <h2 className="display text-xl">No invoices yet</h2>
        <p className="mt-1 text-muted">Invoices you create will appear here.</p>
      </section>
    </WalletGate>
  );
}
