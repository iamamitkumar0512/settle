"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { zeroAddress, type Address, type Hash } from "viem";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { AccountMenu } from "@/components/account-menu";
import { AddUsdt } from "@/components/add-usdt";
import { FinishSetup } from "@/components/finish-setup";
import { InvoicePdf } from "@/components/invoice-pdf";
import { LoginCard } from "@/components/login-card";
import { Message } from "@/components/message";
import { SwitchNetwork } from "@/components/switch-network";
import { invoiceCalendarFile } from "@/lib/calendar";
import { whitechainSepolia } from "@/lib/chains";
import { registry, usdtAbi, USDT_ADDRESS } from "@/lib/contracts";
import { explorerTxUrl, formatDate, formatUsdt, shortAddress } from "@/lib/format";
import { InvoiceStatus, type Invoice } from "@/lib/invoice";
import { payUrl, usePayLinkKey } from "@/lib/pay-link";
import { postJson, splitSignature } from "@/lib/relay-client";
import { paymentAuthorization } from "@/lib/typed-data";
import { useInvoice } from "@/lib/use-invoice";
import { useInvoiceDetails } from "@/lib/use-invoice-details";
import { useNow } from "@/lib/use-now";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";
import { useUsdtBalance } from "@/lib/use-usdt-balance";
import { isInsufficientGas, isUserRejection, revertName } from "@/lib/wallet-errors";

const usdt = {
  address: USDT_ADDRESS,
  abi: usdtAbi,
  chainId: whitechainSepolia.id,
} as const;

type Stage = "idle" | "approving" | "approveConfirming" | "paying" | "payConfirming";

type PayProps = { invoice: Invoice; onChanged: () => Promise<unknown> };

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

// Saves the due date to the customer's own calendar, which then reminds them by itself.
function AddToCalendar({ invoice }: { invoice: Invoice }) {
  const { data: details } = useInvoiceDetails(invoice.id);
  const linkKey = usePayLinkKey();
  const now = useNow(60_000);

  if (invoice.status !== InvoiceStatus.Open || invoice.dueAt <= now) return null;

  function download() {
    const file = invoiceCalendarFile({
      id: invoice.id,
      merchantName: details?.merchantName,
      memo: details?.memo,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
      // The key stays on the link, so the saved event still opens the invoice's PDF.
      payUrl: payUrl(invoice.id, linkKey),
      createdAt: new Date(),
    });
    const url = URL.createObjectURL(new Blob([file], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `settle-invoice-${invoice.id}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      className="mt-1 block cursor-pointer text-[13px]/[18px] text-accent-text underline-offset-2 hover:underline"
      onClick={download}
    >
      Add to calendar
    </button>
  );
}

function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  const { data: details } = useInvoiceDetails(invoice.id);

  return (
    <>
      <div>
        <div className="text-muted">
          {details?.merchantName ?? (
            <span className="figure">{shortAddress(invoice.merchant)}</span>
          )}{" "}
          is requesting
        </div>
        <div className="figure mt-1 text-5xl/[56px] tracking-tight md:text-[56px]/[64px]">
          {formatUsdt(invoice.amount)}
        </div>
        <div className="figure text-lg text-muted">USDT</div>
      </div>
      {details?.memo && <p className="border-t border-line pt-4">{details.memo}</p>}
      <InvoicePdf id={invoice.id} className="border-t border-line pt-4" />
      <div className="flex flex-wrap gap-8 border-t border-line pt-4">
        {details && (
          <div>
            <div className="label">Paid to</div>
            <div className="figure mt-1">{shortAddress(invoice.merchant)}</div>
          </div>
        )}
        <div>
          <div className="label">Invoice</div>
          <div className="figure mt-1">#{String(invoice.id)}</div>
        </div>
        <div>
          <div className="label">Due</div>
          <div className="mt-1">{formatDate(new Date(Number(invoice.dueAt) * 1000))}</div>
          <AddToCalendar invoice={invoice} />
        </div>
      </div>
    </>
  );
}

function PaidCard({ invoice }: { invoice: Invoice }) {
  // A shop that sent the customer here can ask for a way back. Only a path on this site is
  // accepted, so a pay link can't be used to send anyone somewhere else.
  const requested = useSearchParams().get("return");
  const returnPath = requested && /^\/(?!\/)[\w\-./?=&%]*$/.test(requested) ? requested : null;

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
      {returnPath && (
        <Link href={returnPath} className="btn btn-primary btn-wide">
          Back to the shop
        </Link>
      )}
      <Link
        href={`/pay/${invoice.id}/receipt`}
        className={`btn btn-wide ${returnPath ? "" : "btn-primary"}`}
      >
        View receipt
      </Link>
      <Link href="/pay" className="text-[13px]/[18px] text-accent-text">
        See all your invoices
      </Link>
    </div>
  );
}

// One signature, no gas: the customer signs and Settle sends the payment.
function GaslessPay({ invoice, payer, onChanged }: PayProps & { payer: Address }) {
  const action = useSignedAction();

  async function pay() {
    const typed = paymentAuthorization(invoice, payer);
    await action.run(typed, (signature) =>
      postJson("/api/relay/pay", {
        invoiceId: invoice.id,
        payer,
        validAfter: typed.message.validAfter,
        validBefore: typed.message.validBefore,
        ...splitSignature(signature),
      }),
    );
    // Also after a failure: someone else may have paid or cancelled it meanwhile.
    await onChanged();
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-wide" disabled={action.busy} onClick={pay}>
        {action.label(`Pay ${formatUsdt(invoice.amount)} USDT`, "Sending your payment…")}
      </button>
      {action.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </>
  );
}

function PayCard({ invoice, onChanged }: PayProps) {
  const session = useSession();
  const quote = useRelayQuote();
  const balance = useUsdtBalance(session.address);
  const [paysOwnGas, setPaysOwnGas] = useState(false);

  if (!session.address || balance.data === undefined || quote.isPending) {
    return <p className="text-center text-muted">Checking your balance…</p>;
  }

  const payer = session.address;
  const hasFunds = balance.data >= invoice.amount;
  const isWallet = session.kind === "wallet";
  // The invoice's fee repays the relayer's gas. It still counts after gas has risen, up to double.
  const canRelay =
    quote.available && invoice.relayFee * 2n >= quote.relayFee && invoice.amount >= quote.minInvoice;
  // A wallet can pay its own gas instead. The merchant then receives the whole amount.
  const gasless = canRelay && !(isWallet && paysOwnGas);

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
          <span className="figure">{formatUsdt(invoice.amount)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Network fee</span>
          <span>{gasless ? "Free for you" : "Gas from your wallet, in WBT"}</span>
        </div>
      </div>
      {isWallet && canRelay && hasFunds && (
        <label className="flex items-center gap-2.5 text-[13px]/[18px]">
          <input
            type="checkbox"
            checked={paysOwnGas}
            onChange={(event) => setPaysOwnGas(event.target.checked)}
          />
          Pay the gas from my wallet in WBT instead
        </label>
      )}
      {!hasFunds && session.kind === "email" ? (
        <AddUsdt
          address={payer}
          missing={invoice.amount - balance.data}
          purpose="to pay this invoice"
        />
      ) : !hasFunds ? (
        <>
          <button type="button" className="btn btn-primary btn-wide" disabled>
            Not enough USDT
          </button>
          <p className="text-center text-[13px]/[18px] text-muted">
            You need {formatUsdt(invoice.amount - balance.data)} more USDT in this wallet.
          </p>
        </>
      ) : gasless ? (
        <GaslessPay invoice={invoice} payer={payer} onChanged={onChanged} />
      ) : session.kind === "wallet" ? (
        <DirectPay invoice={invoice} onChanged={onChanged} />
      ) : (
        <p role="alert" className="text-[13px]/[18px] text-late">
          Settle can&apos;t send payments right now. Try again later.
        </p>
      )}
    </>
  );
}

// The wallet approves and pays with its own gas, by choice or when Settle can't relay.
function DirectPay({ invoice, onChanged }: PayProps) {
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const { address } = useSession();
  const write = useWriteContract();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string>();
  const [sentHash, setSentHash] = useState<Hash>();

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

  if (allowance.data === undefined) {
    return <p className="text-center text-muted">Checking your wallet…</p>;
  }

  const isApproved = allowance.data >= invoice.amount;

  return (
    <>
      <p className="text-[13px]/[18px] text-muted">
        This payment uses your wallet&apos;s own WBT for gas.
      </p>
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
  const session = useSession();

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

  return (
    <Shell aside={summary}>
      {session.status === "loading" ? (
        <p className="text-center text-muted">Loading…</p>
      ) : session.status === "signedOut" ? (
        <LoginCard title="Log in to pay" />
      ) : session.status === "needsWallet" ? (
        <FinishSetup />
      ) : !session.isOnWhitechain ? (
        <SwitchNetwork />
      ) : (
        <>
          <div className="flex justify-end">
            <AccountMenu />
          </div>
          <PayCard invoice={invoice} onChanged={refetch} />
        </>
      )}
    </Shell>
  );
}
