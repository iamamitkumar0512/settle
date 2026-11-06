"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import type { Address } from "viem";
import { formatUsdt } from "@/lib/format";
import { useTopUp } from "@/lib/use-top-up";

function SendFromExchange({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="rounded-[10px] bg-white p-2">
          <QRCodeSVG value={address} size={104} title="Your deposit address" />
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
        Your balance updates when it arrives.
      </p>
    </div>
  );
}

// Adds money to an account. In this test version that is a free top-up, which stands in for a
// card or a bank payment. Sending USDT from an exchange stays available underneath it.
export function AddUsdt({
  address,
  missing,
  purpose,
}: {
  address: Address;
  missing?: bigint;
  purpose?: string;
}) {
  const topUp = useTopUp();
  const wanted = missing ?? topUp.limit;
  const amount = wanted < topUp.limit ? wanted : topUp.limit;

  return (
    <div className="flex flex-col gap-3">
      {missing !== undefined && (
        <p>
          Add <span className="figure">{formatUsdt(missing)} USDT</span> {purpose}.
        </p>
      )}
      {topUp.limit > 0n ? (
        <>
          <button
            type="button"
            className="btn btn-primary btn-wide"
            disabled={topUp.busy}
            onClick={() => topUp.add(amount)}
          >
            {topUp.busy ? "Adding your test money…" : `Add ${formatUsdt(amount)} test USDT`}
          </button>
          <p className="text-[13px]/[18px] text-muted">
            This is a test version, so the money is free. A live version would take a card or a bank
            payment here.
            {missing !== undefined && missing > topUp.limit && (
              <> You can add up to {formatUsdt(topUp.limit)} USDT a day, which is less than this needs.</>
            )}
          </p>
          {topUp.error && (
            <p role="alert" className="text-[13px]/[18px] text-late">
              {topUp.error}
            </p>
          )}
          <details className="text-[13px]/[18px]">
            <summary className="cursor-pointer text-muted">Or send USDT from an exchange</summary>
            <div className="mt-3">
              <SendFromExchange address={address} />
            </div>
          </details>
        </>
      ) : (
        <SendFromExchange address={address} />
      )}
    </div>
  );
}
