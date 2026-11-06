"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { zeroHash, type Hash } from "viem";
import { explorerTxUrl, formatUsdt, periodLabel } from "@/lib/format";
import { newSalt, parseUsdtAmount } from "@/lib/invoice";
import { postJson } from "@/lib/relay-client";
import { planRequest } from "@/lib/typed-data";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";

// A month is 30 days. The shortest one is there so a renewal can be watched happening.
const PERIODS = [
  { seconds: 2_592_000, label: "Every month" },
  { seconds: 604_800, label: "Every week" },
  { seconds: 31_536_000, label: "Every year" },
  { seconds: 60, label: "Every minute (for testing)" },
];

function CreatedPanel({ planId, hash, onReset }: { planId: bigint; hash: Hash; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/subscribe/${planId}`;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="card flex flex-col gap-4 p-6" role="status">
      <div className="flex items-center justify-between gap-4">
        <h2 className="display text-xl">
          Plan <span className="figure">#{String(planId)}</span> created
        </h2>
        <span className="pill tone-paid">Active</span>
      </div>
      <div className="well flex flex-wrap items-center justify-between gap-3">
        <span className="figure text-[13px]/[18px] break-all">{link}</span>
        <button type="button" className="btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy subscribe link"}
        </button>
      </div>
      <a
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noreferrer"
        className="text-[13px]/[18px] text-accent-text"
      >
        View on explorer ↗
      </a>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={onReset}>
          Create another
        </button>
        <Link href="/plans" className="btn btn-primary">
          Back to plans
        </Link>
      </div>
    </section>
  );
}

export function NewPlanForm() {
  const session = useSession();
  const action = useSignedAction();
  const quote = useRelayQuote();
  const [amountText, setAmountText] = useState("");
  const [period, setPeriod] = useState(PERIODS[0].seconds);
  const [amountError, setAmountError] = useState<string>();
  const [created, setCreated] = useState<{ planId: bigint; hash: Hash }>();

  // The fee is taken from every payment, so it has to leave the merchant something.
  const relayFee = quote.chargeFee;
  const minimum = quote.minInvoice > relayFee ? quote.minInvoice : relayFee + 1n;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (action.busy || !session.address) return;

    const amount = parseUsdtAmount(amountText);
    if (amount === null || amount < minimum) {
      return setAmountError(`Enter at least ${formatUsdt(minimum)} USDT, with up to 6 decimals.`);
    }
    setAmountError(undefined);

    const typed = planRequest({
      merchant: session.address,
      amount,
      period,
      ref: zeroHash,
      relayFee,
      salt: newSalt(),
    });
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/plans", { request: typed.message, signature }),
    );
    if (data) setCreated({ planId: BigInt(data.planId as string), hash: data.txHash as Hash });
  }

  if (created) {
    return (
      <CreatedPanel
        planId={created.planId}
        hash={created.hash}
        onReset={() => {
          setCreated(undefined);
          setAmountText("");
        }}
      />
    );
  }

  return (
    <form className="card flex flex-col gap-5 p-6" onSubmit={onSubmit} noValidate>
      <fieldset disabled={action.busy} className="flex flex-col gap-5">
        <legend className="sr-only">Plan details</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field">
            Amount per payment
            <span className="relative block">
              <input
                className="input figure pr-18 text-xl"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={amountError ? true : undefined}
                value={amountText}
                onChange={(event) => setAmountText(event.target.value)}
              />
              <span className="figure absolute right-3.5 top-3.5 text-muted">USDT</span>
            </span>
            {amountError && (
              <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                {amountError}
              </span>
            )}
          </label>
          <label className="field">
            Billed
            <select
              className="input"
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
            >
              {PERIODS.map(({ seconds, label }) => (
                <option key={seconds} value={seconds}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      {quote.available ? (
        <div className="well flex flex-col gap-1.5 text-[13px]/[18px]">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted">Network fee, taken from each payment</span>
            <span className="figure">{formatUsdt(relayFee)} USDT</span>
          </div>
          <p className="text-muted">
            It repays the gas Settle spends to collect a payment {periodLabel(period)}. Settle adds
            nothing on top. Your customer pays the amount above and no gas.
          </p>
        </div>
      ) : (
        !quote.isPending && (
          <p role="alert" className="well text-[13px]/[18px] text-late">
            Settle can&apos;t send transactions right now, so plans can&apos;t be created.
          </p>
        )
      )}
      {action.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Link href="/plans" className="btn">
          Cancel
        </Link>
        <button
          type="submit"
          className="btn btn-primary min-w-[200px]"
          disabled={action.busy || !quote.available}
        >
          {action.label("Create plan", "Creating plan…")}
        </button>
      </div>
    </form>
  );
}
