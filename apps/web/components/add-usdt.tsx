"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { Address } from "viem";
import { formatUsdt } from "@/lib/format";

// An email account is topped up by sending USDT to its address. The balance refreshes by itself.
export function AddUsdt({
  address,
  missing,
  purpose,
}: {
  address: Address;
  missing: bigint;
  purpose: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        Add <span className="figure">{formatUsdt(missing)} USDT</span> {purpose}.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-[10px] bg-white p-2">
          <QRCodeSVG value={address} size={104} title="Your wallet address" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px]/[18px] text-muted">Send USDT on Whitechain to</div>
          <div className="figure mt-0.5 text-[13px]/[18px] break-all">{address}</div>
          <button type="button" className="btn mt-3" onClick={copy}>
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
      </div>
      <p role="status" className="text-[13px]/[18px] text-muted">
        Waiting for your USDT. This page updates when it arrives.
      </p>
    </div>
  );
}
