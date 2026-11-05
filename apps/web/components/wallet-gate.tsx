"use client";

import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { whitechainSepolia } from "@/lib/chains";
import { WalletButton } from "./wallet-button";

function Prompt({ title, text }: { title: string; text: string }) {
  return (
    <section className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="display text-xl">{title}</h2>
      <p className="text-muted">{text}</p>
      <WalletButton />
    </section>
  );
}

export function WalletGate({ children }: { children: ReactNode }) {
  const { chainId, status } = useConnection();

  if (status !== "connected") {
    return (
      <Prompt
        title="Connect your wallet"
        text="Your wallet is your merchant account on Settle."
      />
    );
  }

  if (chainId !== whitechainSepolia.id) {
    return (
      <Prompt
        title="Switch to Whitechain"
        text={`Settle runs on ${whitechainSepolia.name}.`}
      />
    );
  }

  return children;
}
