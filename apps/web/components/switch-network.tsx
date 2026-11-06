"use client";

import { useSwitchChain } from "wagmi";
import { whitechainSepolia } from "@/lib/chains";

// A wallet can only sign Settle's requests while it is on Whitechain.
export function SwitchNetwork() {
  const switchChain = useSwitchChain();

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h2 className="display text-xl">Switch to Whitechain</h2>
      <p className="text-muted">Your wallet is on another network. Settle runs on {whitechainSepolia.name}.</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={switchChain.isPending}
        onClick={() => switchChain.mutate({ chainId: whitechainSepolia.id })}
      >
        {switchChain.isPending ? "Check your wallet" : "Switch network"}
      </button>
      {switchChain.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          Couldn&apos;t switch. Add {whitechainSepolia.name} in your wallet and try again.
        </p>
      )}
    </div>
  );
}
