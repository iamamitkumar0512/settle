"use client";

import { useState } from "react";
import { formatUnits, zeroAddress, type Hash } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { whitechainSepolia } from "@/lib/chains";
import { registry, USDT_ADDRESS, USDT_DECIMALS, usdtAbi } from "@/lib/contracts";
import { explorerTxUrl, formatUsdt, shortAddress } from "@/lib/format";
import { parseUsdtAmount, type Invoice } from "@/lib/invoice";
import { useTransaction } from "@/lib/use-transaction";

const usdt = {
  address: USDT_ADDRESS,
  abi: usdtAbi,
  chainId: whitechainSepolia.id,
} as const;

function TransactionError({ message, hash }: { message?: string; hash?: Hash }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px]/[18px] text-late">
      {message}{" "}
      {hash && (
        <a className="underline" href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
          View transaction ↗
        </a>
      )}
    </p>
  );
}

type ActionProps = {
  invoice: Invoice;
  onChanged: () => Promise<unknown>;
};

export function CancelCard({ invoice, onChanged }: ActionProps) {
  const { address } = useConnection();
  const tx = useTransaction();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = tx.phase !== "idle";

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function cancel() {
    const request = {
      ...registry,
      functionName: "cancel",
      args: [invoice.id],
    } as const;
    const hash = await tx.run(async () => {
      await tx.client!.simulateContract({ ...request, account: address });
      return tx.writeContractAsync(request);
    }, "The invoice wasn't cancelled. Try again.");
    if (hash) await onChanged();
  }

  return (
    <>
      <h2 className="display text-xl">Waiting for payment</h2>
      <button type="button" className="btn btn-primary" onClick={copyLink}>
        {copied ? "Link copied" : "Copy pay link"}
      </button>
      {confirming ? (
        <div className="well flex flex-col gap-3">
          <p className="text-[13px]/[18px]">
            Cancel this invoice? The customer will no longer be able to pay it. This can&apos;t be
            undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn flex-1"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep invoice
            </button>
            <button type="button" className="btn flex-1 text-late" disabled={busy} onClick={cancel}>
              {tx.phase === "wallet" && "Confirm in wallet"}
              {tx.phase === "confirming" && "Cancelling…"}
              {tx.phase === "idle" && "Yes, cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn text-late" onClick={() => setConfirming(true)}>
          Cancel invoice
        </button>
      )}
      <TransactionError message={tx.error} hash={tx.sentHash} />
    </>
  );
}

export function RefundCard({ invoice, onChanged }: ActionProps) {
  const { address } = useConnection();
  const tx = useTransaction();
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string>();
  const [refundHash, setRefundHash] = useState<Hash>();

  const owner = address ?? zeroAddress;
  const balance = useReadContract({
    ...usdt,
    functionName: "balanceOf",
    args: [owner],
    query: { enabled: Boolean(address) },
  });
  const allowance = useReadContract({
    ...usdt,
    functionName: "allowance",
    args: [owner, registry.address],
    query: { enabled: Boolean(address) },
  });

  const refundable = invoice.amount - invoice.refunded;
  const amount = parseUsdtAmount(text);
  const needsApproval =
    amount !== null && allowance.data !== undefined && allowance.data < amount;
  const busy = tx.phase !== "idle";

  if (refundHash) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
        <span className="pill tone-paid">Refund sent</span>
        <a
          className="text-[13px]/[18px] text-accent-text"
          href={explorerTxUrl(refundHash)}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer ↗
        </a>
        <button type="button" className="btn w-full" onClick={() => setRefundHash(undefined)}>
          Done
        </button>
      </div>
    );
  }

  if (refundable === 0n) {
    return (
      <>
        <h2 className="display text-xl">Refund</h2>
        <p className="text-muted">This invoice is fully refunded.</p>
      </>
    );
  }

  function validate() {
    if (amount === null) {
      setInputError("Enter an amount above 0, with up to 6 decimals.");
      return false;
    }
    if (amount > refundable) {
      setInputError(`You can refund up to ${formatUsdt(refundable)} USDT.`);
      return false;
    }
    if (balance.data !== undefined && amount > balance.data) {
      setInputError(`This wallet only holds ${formatUsdt(balance.data)} USDT.`);
      return false;
    }
    setInputError(undefined);
    return true;
  }

  async function approve() {
    if (!validate() || amount === null) return;
    const hash = await tx.run(
      () =>
        tx.writeContractAsync({
          ...usdt,
          functionName: "approve",
          args: [registry.address, amount],
        }),
      "The approval didn't go through. Try again.",
    );
    if (hash) await allowance.refetch();
  }

  async function refund() {
    if (!validate() || amount === null) return;
    const request = {
      ...registry,
      functionName: "refund",
      args: [invoice.id, amount],
    } as const;
    const hash = await tx.run(async () => {
      await tx.client!.simulateContract({ ...request, account: address });
      return tx.writeContractAsync(request);
    }, "The refund didn't go through. Check your balance and try again.");
    if (hash) {
      await Promise.all([balance.refetch(), allowance.refetch(), onChanged()]);
      setText("");
      setRefundHash(hash);
    }
  }

  return (
    <>
      <h2 className="display text-xl">Refund</h2>
      <div className="well flex flex-col gap-1.5 text-[13px]/[18px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Goes back to</span>
          <span className="figure">{shortAddress(invoice.payer)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Can still refund</span>
          <span className="figure">{formatUsdt(refundable)} USDT</span>
        </div>
      </div>
      <label className="field">
        Amount
        <span className="relative block">
          <input
            className="input figure pr-[72px] text-xl"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            disabled={busy}
            aria-invalid={inputError ? true : undefined}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setInputError(undefined);
            }}
          />
          <button
            type="button"
            className="btn figure absolute right-[7px] top-[7px] min-h-[38px] px-2.5 text-xs"
            disabled={busy}
            onClick={() => setText(formatUnits(refundable, USDT_DECIMALS))}
          >
            Max
          </button>
        </span>
        {inputError && (
          <span role="alert" className="text-[13px]/[18px] font-normal text-late">
            {inputError}
          </span>
        )}
      </label>
      {needsApproval ? (
        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={busy}
          onClick={approve}
        >
          {tx.phase === "wallet" && "Confirm in your wallet"}
          {tx.phase === "confirming" && "Approving…"}
          {tx.phase === "idle" && `Approve ${formatUsdt(amount)} USDT`}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={busy}
          onClick={refund}
        >
          {tx.phase === "wallet" && "Confirm in your wallet"}
          {tx.phase === "confirming" && "Sending refund…"}
          {tx.phase === "idle" &&
            (amount === null ? "Enter an amount" : `Refund ${formatUsdt(amount)} USDT`)}
        </button>
      )}
      <TransactionError message={tx.error} hash={tx.sentHash} />
      <p className="text-[13px]/[18px] text-muted">
        Paid from your wallet to the customer&apos;s. They will see it on their receipt.
      </p>
    </>
  );
}
