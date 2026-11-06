"use client";

import { useState } from "react";
import { formatUnits, type Hash } from "viem";
import { USDT_DECIMALS } from "@/lib/contracts";
import { explorerTxUrl, formatUsdt, shortAddress } from "@/lib/format";
import { parseUsdtAmount, type Invoice } from "@/lib/invoice";
import { payUrl } from "@/lib/pay-link";
import { postJson, splitSignature } from "@/lib/relay-client";
import { cancelInvoiceRequest, refundAuthorization } from "@/lib/typed-data";
import { useSignedAction } from "@/lib/use-signed-action";
import { useUsdtBalance } from "@/lib/use-usdt-balance";
import { RemindCustomer, type ReminderContact } from "./remind-customer";

type ActionProps = {
  invoice: Invoice;
  onChanged: () => Promise<unknown>;
};

export function CancelCard({
  invoice,
  contact,
  isOverdue,
  onChanged,
}: ActionProps & { contact: ReminderContact; isOverdue: boolean }) {
  const action = useSignedAction();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(payUrl(invoice.id, contact.linkKey));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function cancel() {
    const typed = cancelInvoiceRequest(invoice.id);
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/cancel", {
        invoiceId: invoice.id,
        deadline: typed.message.deadline,
        signature,
      }),
    );
    if (data) await onChanged();
  }

  return (
    <>
      <h2 className="display text-xl">Waiting for payment</h2>
      <button type="button" className="btn btn-primary" onClick={copyLink}>
        {copied ? "Link copied" : "Copy pay link"}
      </button>
      <RemindCustomer invoice={invoice} contact={contact} isOverdue={isOverdue} />
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
              disabled={action.busy}
              onClick={() => setConfirming(false)}
            >
              Keep invoice
            </button>
            <button type="button" className="btn flex-1 text-late" disabled={action.busy} onClick={cancel}>
              {action.label("Yes, cancel", "Cancelling…")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn text-late" onClick={() => setConfirming(true)}>
          Cancel invoice
        </button>
      )}
      {action.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </>
  );
}

export function RefundCard({ invoice, onChanged }: ActionProps) {
  const action = useSignedAction();
  const { data: balance } = useUsdtBalance(invoice.merchant);
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string>();
  const [refundHash, setRefundHash] = useState<Hash>();

  const refundable = invoice.amount - invoice.refunded;
  const amount = parseUsdtAmount(text);

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

  async function refund() {
    if (amount === null) return setInputError("Enter an amount above 0, with up to 6 decimals.");
    if (amount > refundable) {
      return setInputError(`You can refund up to ${formatUsdt(refundable)} USDT.`);
    }
    if (balance !== undefined && amount > balance) {
      return setInputError(`Your balance is ${formatUsdt(balance)} USDT.`);
    }
    setInputError(undefined);

    const typed = refundAuthorization(invoice, amount);
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/refund", {
        invoiceId: invoice.id,
        amount,
        validAfter: 0n,
        validBefore: typed.message.validBefore,
        ...splitSignature(signature),
      }),
    );
    if (data) {
      await onChanged();
      setText("");
      setRefundHash(data.txHash as Hash);
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
            disabled={action.busy}
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
            disabled={action.busy}
            onClick={() => setText(formatUnits(refundable, USDT_DECIMALS))}
          >
            Max
          </button>
        </span>
      </label>
      {(inputError ?? action.error) && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {inputError ?? action.error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-wide" disabled={action.busy} onClick={refund}>
        {action.label(
          amount === null ? "Enter an amount" : `Refund ${formatUsdt(amount)} USDT`,
          "Sending refund…",
        )}
      </button>
      <p className="text-[13px]/[18px] text-muted">
        One click, no gas. It goes from your balance to the customer&apos;s, and shows on their
        receipt.
      </p>
    </>
  );
}
