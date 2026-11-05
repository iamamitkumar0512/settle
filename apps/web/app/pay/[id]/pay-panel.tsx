"use client";

import Link from "next/link";
import { useState } from "react";
import { zeroAddress, type Hash } from "viem";
import { useConnection, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Message } from "@/components/message";
import { WalletButton } from "@/components/wallet-button";
import { whitechainSepolia } from "@/lib/chains";
import { registry, usdtAbi, USDT_ADDRESS } from "@/lib/contracts";
import { explorerTxUrl, formatDate, formatUsdt, shortAddress } from "@/lib/format";
import { InvoiceStatus, type Invoice } from "@/lib/invoice";
import { useInvoice } from "@/lib/use-invoice";
import { isInsufficientGas, isUserRejection, revertName } from "@/lib/wallet-errors";

const REFRESH_MS = 15_000;

const usdt = {
  address: USDT_ADDRESS,
  abi: usdtAbi,
  chainId: whitechainSepolia.id,
} as const;

type Stage = "idle" | "approving" | "approveConfirming" | "paying" | "payConfirming";

function Shell({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-[1040px] flex-1 content-center items-center gap-10 px-4 py-10 md:grid-cols-[minmax(0,1fr)_420px] md:gap-14 md:px-8">
      <section aria-label="Invoice" className="flex flex-col gap-6">
        {aside}
      </section>
      <section
        aria-label="Payment"
        className="card flex min-h-[320px] flex-col justify-center gap-4 p-6"
      >
        {children}
      </section>
    </main>
  );
}

function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  return (
    <>
      <div>
        <div className="text-muted">
          <span className="figure">{shortAddress(invoice.merchant)}</span> is requesting
        </div>
        <div className="figure mt-1 text-5xl/[56px] tracking-tight md:text-[56px]/[64px]">
          {formatUsdt(invoice.amount)}
        </div>
        <div className="figure text-lg text-muted">USDT</div>
      </div>
      <div className="flex flex-wrap gap-8 border-t border-line pt-4">
        <div>
          <div className="label">Invoice</div>
          <div className="figure mt-1">#{String(invoice.id)}</div>
        </div>
        <div>
          <div className="label">Due</div>
          <div className="mt-1">{formatDate(new Date(Number(invoice.dueAt) * 1000))}</div>
        </div>
      </div>
    </>
  );
}

function PaidCard({ invoice }: { invoice: Invoice }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center" role="status">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="26" fill="#C8F04D" />
        <path
          d="M16 27l7 7 13-15"
          fill="none"
          stroke="#161C04"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="display text-2xl">Payment complete</h1>
      <p className="text-muted">
        {formatUsdt(invoice.amount)} USDT paid on{" "}
        {formatDate(new Date(Number(invoice.paidAt) * 1000))}.
      </p>
      {invoice.refunded > 0n && (
        <p className="text-refund">{formatUsdt(invoice.refunded)} USDT refunded.</p>
      )}
      <Link href={`/pay/${invoice.id}/receipt`} className="btn btn-primary btn-wide">
        View receipt
      </Link>
    </div>
  );
}

function PayFlow({
  invoice,
  onChanged,
}: {
  invoice: Invoice;
  onChanged: () => Promise<unknown>;
}) {
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const { address } = useConnection();
  const write = useWriteContract();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string>();
  const [sentHash, setSentHash] = useState<Hash>();

  const balance = useReadContract({
    ...usdt,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: Boolean(address), refetchInterval: REFRESH_MS },
  });
  const allowance = useReadContract({
    ...usdt,
    functionName: "allowance",
    args: [address ?? zeroAddress, registry.address],
    query: { enabled: Boolean(address) },
  });

  const busy = stage !== "idle";
  const amount = formatUsdt(invoice.amount);

  async function confirm(hash: Hash) {
    setSentHash(hash);
    const receipt = await client!.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  }

  function showWriteError(cause: unknown, fallback: string) {
    if (isUserRejection(cause)) {
      setError("You cancelled in your wallet. No money moved.");
    } else if (isInsufficientGas(cause)) {
      setError("This wallet doesn't have enough WBT for gas.");
    } else if (revertName(cause) === "InvoiceNotOpen") {
      void onChanged();
    } else {
      setError(fallback);
    }
  }

  async function approve() {
    setError(undefined);
    setSentHash(undefined);
    setStage("approving");
    let hash: Hash;
    try {
      hash = await write.mutateAsync({
        ...usdt,
        functionName: "approve",
        args: [registry.address, invoice.amount],
      });
    } catch (cause) {
      showWriteError(cause, "The approval didn't go through. Try again.");
      setStage("idle");
      return;
    }
    setStage("approveConfirming");
    try {
      if (await confirm(hash)) {
        await allowance.refetch();
        setSentHash(undefined);
      } else {
        setError("The approval failed. No money moved.");
      }
    } catch {
      setError("We couldn't confirm the approval. Check it before trying again.");
    }
    setStage("idle");
  }

  async function pay() {
    setError(undefined);
    setSentHash(undefined);
    setStage("paying");
    let hash: Hash;
    try {
      // Catches an invoice paid or cancelled since this page loaded, before any wallet prompt.
      await client!.simulateContract({
        ...registry,
        functionName: "pay",
        args: [invoice.id],
        account: address,
      });
      hash = await write.mutateAsync({
        ...registry,
        functionName: "pay",
        args: [invoice.id],
      });
    } catch (cause) {
      showWriteError(cause, "The payment didn't go through. Try again.");
      setStage("idle");
      return;
    }
    setStage("payConfirming");
    try {
      if (await confirm(hash)) {
        await onChanged();
      } else {
        setError("The payment failed. No money moved.");
        await onChanged();
      }
    } catch {
      // The payment may have landed, so asking to retry here could confuse the customer.
      setError("We couldn't confirm your payment. Check it before trying again.");
    }
    setStage("idle");
  }

  if (balance.data === undefined || allowance.data === undefined) {
    return <p className="text-center text-muted">Checking your balance…</p>;
  }

  const hasFunds = balance.data >= invoice.amount;
  const isApproved = allowance.data >= invoice.amount;

  return (
    <>
      <h1 className="display text-[22px]/[30px]">Confirm payment</h1>
      <div className="well flex flex-col gap-2">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Your balance</span>
          <span className="figure">{formatUsdt(balance.data)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">You pay</span>
          <span className="figure">{amount} USDT</span>
        </div>
      </div>
      {!hasFunds ? (
        <>
          <button type="button" className="btn btn-primary btn-wide" disabled>
            Not enough USDT
          </button>
          <p className="text-center text-[13px]/[18px] text-muted">
            You need {formatUsdt(invoice.amount - balance.data)} more USDT in this wallet.
          </p>
        </>
      ) : (
        <>
          <ol className="flex gap-2 text-[13px]/[18px]" aria-label="Payment steps">
            <li className={`flex-1 border-t-2 pt-1.5 ${isApproved ? "border-accent-text" : "border-line"}`}>
              1. Approve USDT
            </li>
            <li className="flex-1 border-t-2 border-line pt-1.5">2. Pay</li>
          </ol>
          {isApproved ? (
            <button type="button" className="btn btn-primary btn-wide" disabled={busy} onClick={pay}>
              {stage === "paying" && "Confirm in your wallet"}
              {stage === "payConfirming" && "Sending your payment…"}
              {stage === "idle" && `Pay ${amount} USDT`}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-wide" disabled={busy} onClick={approve}>
              {stage === "approving" && "Confirm in your wallet"}
              {stage === "approveConfirming" && "Approving…"}
              {stage === "idle" && `Approve ${amount} USDT`}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}{" "}
          {sentHash && (
            <a className="underline" href={explorerTxUrl(sentHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
        </p>
      )}
    </>
  );
}

export function PayPanel() {
  const { id, invoice, state, refetch } = useInvoice();
  const { chainId, status } = useConnection();

  if (state === "notFound") {
    return <Message title="Invoice not found" text="Check the link and try again." />;
  }
  if (state === "error") {
    return (
      <Message
        title="Couldn't load this invoice"
        text="Whitechain didn't respond. Refresh the page to try again."
      />
    );
  }
  if (!invoice || id === null) {
    return <Message title="Loading invoice…" text="" />;
  }
  if (invoice.status === InvoiceStatus.Cancelled) {
    return (
      <Message
        title="This invoice was cancelled"
        text="No payment is due. Contact the sender if you think this is wrong."
      />
    );
  }

  const summary = <InvoiceSummary invoice={invoice} />;

  if (invoice.status !== InvoiceStatus.Open) {
    return (
      <Shell aside={summary}>
        <PaidCard invoice={invoice} />
      </Shell>
    );
  }

  const ready = status === "connected" && chainId === whitechainSepolia.id;

  return (
    <Shell aside={summary}>
      {ready ? (
        <>
          <div className="flex justify-end">
            <WalletButton />
          </div>
          <PayFlow invoice={invoice} onChanged={refetch} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="display text-[22px]/[30px]">Pay from your wallet</h1>
          <p className="text-muted">Connect MetaMask or Rabby to pay this invoice.</p>
          <WalletButton />
        </div>
      )}
    </Shell>
  );
}
