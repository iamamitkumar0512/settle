"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { AccountMenu } from "@/components/account-menu";
import { AddUsdt } from "@/components/add-usdt";
import { CancelSubscription } from "@/components/cancel-subscription";
import { FinishSetup } from "@/components/finish-setup";
import { LoginCard } from "@/components/login-card";
import { Message } from "@/components/message";
import { SwitchNetwork } from "@/components/switch-network";
import { whitechainSepolia } from "@/lib/chains";
import { subscriptions, usdtAbi, USDT_ADDRESS } from "@/lib/contracts";
import { formatDateTime, formatUsdt, periodLabel, shortAddress } from "@/lib/format";
import { newSalt } from "@/lib/invoice";
import { postJson, splitSignature } from "@/lib/relay-client";
import { toSubscription, type Plan } from "@/lib/subscription";
import { subscribeRequest, subscriptionPermit } from "@/lib/typed-data";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";
import { usePlan } from "@/lib/use-subscriptions";
import { useUsdtBalance } from "@/lib/use-usdt-balance";

// How many payments a customer can agree to. The contract stops at this number.
const PERIOD_CHOICES = [3, 6, 12];

function parsePlanId(value: unknown) {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) ? BigInt(value) : null;
}

function PlanSummary({ plan }: { plan: Plan }) {
  return (
    <>
      <div>
        <div className="text-muted">
          <span className="figure">{shortAddress(plan.merchant)}</span> offers a subscription for
        </div>
        <div className="figure mt-1 text-5xl/[56px] tracking-tight md:text-[56px]/[64px]">
          {formatUsdt(plan.amount)}
        </div>
        <div className="figure text-lg text-muted">USDT {periodLabel(plan.period)}</div>
      </div>
      <div className="flex flex-wrap gap-8 border-t border-line pt-4">
        <div>
          <div className="label">Paid to</div>
          <div className="figure mt-1">{shortAddress(plan.merchant)}</div>
        </div>
        <div>
          <div className="label">Plan</div>
          <div className="figure mt-1">#{String(plan.id)}</div>
        </div>
        <div>
          <div className="label">Cancel</div>
          <div className="mt-1">Any time</div>
        </div>
      </div>
    </>
  );
}

function Subscribed({ id, plan, onChanged }: { id: bigint; plan: Plan; onChanged: () => Promise<unknown> }) {
  const read = useReadContract({ ...subscriptions, functionName: "subscriptions", args: [id] });
  if (!read.data) return <p className="text-center text-muted">Loading your subscription…</p>;
  const subscription = toSubscription(id, read.data);

  return (
    <div className="flex flex-col items-center gap-3 text-center" role="status">
      <span className="pill tone-paid">Subscribed</span>
      <h1 className="display text-2xl">You&apos;re subscribed</h1>
      <p className="text-muted">
        Next payment of {formatUsdt(plan.amount)} USDT on{" "}
        {formatDateTime(new Date(Number(subscription.nextChargeAt) * 1000))}.{" "}
        {subscription.periodsLeft} {subscription.periodsLeft === 1 ? "payment" : "payments"} left.
      </p>
      <CancelSubscription id={id} onChanged={onChanged} />
      <Link href="/pay" className="text-[13px]/[18px] text-accent-text">
        See all your subscriptions
      </Link>
    </div>
  );
}

function SubscribeForm({
  plan,
  subscriber,
  onChanged,
}: {
  plan: Plan;
  subscriber: Address;
  onChanged: () => Promise<unknown>;
}) {
  const session = useSession();
  const quote = useRelayQuote();
  const action = useSignedAction();
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const balance = useUsdtBalance(subscriber);
  const [periods, setPeriods] = useState(12);

  if (balance.data === undefined || quote.isPending) {
    return <p className="text-center text-muted">Checking your balance…</p>;
  }

  const total = plan.amount * BigInt(periods);
  const hasFunds = balance.data >= plan.amount;
  // The plan's fee repays the relayer's gas. It still counts after gas has risen, up to double.
  const canRelay = quote.available && plan.relayFee * 2n >= quote.chargeFee;

  async function subscribe() {
    const usdt = { address: USDT_ADDRESS, abi: usdtAbi } as const;
    const [nonce, allowance] = await Promise.all([
      client!.readContract({ ...usdt, functionName: "nonces", args: [subscriber] }),
      client!.readContract({
        ...usdt,
        functionName: "allowance",
        args: [subscriber, subscriptions.address],
      }),
    ]);
    const request = subscribeRequest({ planId: plan.id, subscriber, periods, salt: newSalt() });
    // A permit replaces the allowance, so this one keeps what earlier subscriptions still need.
    const permit = subscriptionPermit(subscriber, allowance + total, nonce);

    const data = await action.runAll([request, permit], ([signature, permitSignature]) =>
      postJson("/api/relay/subscribe", {
        request: request.message,
        signature,
        permit: {
          value: permit.message.value,
          deadline: permit.message.deadline,
          ...splitSignature(permitSignature),
        },
      }),
    );
    if (data) await onChanged();
  }

  return (
    <>
      <h1 className="display text-[22px]/[30px]">Subscribe</h1>
      <label className="field">
        For how long?
        <select
          className="input"
          disabled={action.busy}
          value={periods}
          onChange={(event) => setPeriods(Number(event.target.value))}
        >
          {PERIOD_CHOICES.map((count) => (
            <option key={count} value={count}>
              {count} payments
            </option>
          ))}
        </select>
      </label>
      <div className="well flex flex-col gap-2">
        <div className="flex justify-between gap-4">
          <span className="text-muted">Your balance</span>
          <span className="figure">{formatUsdt(balance.data)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Today</span>
          <span className="figure">{formatUsdt(plan.amount)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Then {periodLabel(plan.period)}</span>
          <span className="figure">{formatUsdt(plan.amount)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">The most it can take in all</span>
          <span className="figure">{formatUsdt(total)} USDT</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">Network fee</span>
          <span>Free for you</span>
        </div>
      </div>
      {!canRelay ? (
        <p role="alert" className="text-[13px]/[18px] text-late">
          Settle can&apos;t start subscriptions right now. Try again later.
        </p>
      ) : !hasFunds && session.kind === "email" ? (
        <AddUsdt
          address={subscriber}
          missing={plan.amount - balance.data}
          purpose="for the first payment"
        />
      ) : !hasFunds ? (
        <>
          <button type="button" className="btn btn-primary btn-wide" disabled>
            Not enough USDT
          </button>
          <p className="text-center text-[13px]/[18px] text-muted">
            You need {formatUsdt(plan.amount - balance.data)} more USDT in this wallet.
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary btn-wide"
            disabled={action.busy}
            onClick={subscribe}
          >
            {action.label(`Subscribe for ${formatUsdt(plan.amount)} USDT`, "Starting your subscription…")}
          </button>
          <p className="text-center text-[13px]/[18px] text-muted">
            Later payments are collected by themselves. You can cancel at any time.
          </p>
        </>
      )}
      {action.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {action.error}
        </p>
      )}
    </>
  );
}

function PlanClosed() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="display text-2xl">This plan is closed</h1>
      <p className="text-muted">It takes no new subscribers.</p>
    </div>
  );
}

function SubscribeCard({ plan, subscriber }: { plan: Plan; subscriber: Address }) {
  const current = useReadContract({
    ...subscriptions,
    functionName: "subscriptionOf",
    args: [plan.id, subscriber],
  });

  if (current.data === undefined) return <p className="text-center text-muted">Loading…</p>;
  if (current.data !== 0n) {
    return <Subscribed id={current.data} plan={plan} onChanged={current.refetch} />;
  }
  if (!plan.active) return <PlanClosed />;
  return <SubscribeForm plan={plan} subscriber={subscriber} onChanged={current.refetch} />;
}

export function SubscribePanel() {
  const planId = parsePlanId(useParams().planId);
  const { plan, state } = usePlan(planId);
  const session = useSession();

  if (state === "notFound") {
    return <Message title="Plan not found" text="Check the link and try again." />;
  }
  if (state === "error") {
    return (
      <Message
        title="Couldn't load this plan"
        text="Whitechain didn't respond. Refresh the page to try again."
      />
    );
  }
  if (!plan) return <Message title="Loading plan…" text="" />;

  return (
    <main className="mx-auto grid w-full max-w-[1040px] flex-1 content-center items-center gap-10 px-4 py-10 md:grid-cols-[minmax(0,1fr)_420px] md:gap-14 md:px-8">
      <section aria-label="Plan" className="flex flex-col gap-6">
        <PlanSummary plan={plan} />
      </section>
      <section
        aria-label="Subscription"
        className="card flex min-h-[320px] flex-col justify-center gap-4 p-6"
      >
        {session.status === "loading" ? (
          <p className="text-center text-muted">Loading…</p>
        ) : session.status === "signedOut" ? (
          // Nobody needs to log in just to learn the plan is closed.
          plan.active ? <LoginCard title="Log in to subscribe" /> : <PlanClosed />
        ) : session.status === "needsWallet" ? (
          <FinishSetup />
        ) : !session.isOnWhitechain ? (
          <SwitchNetwork />
        ) : (
          <>
            <div className="flex justify-end">
              <AccountMenu />
            </div>
            {session.address && <SubscribeCard plan={plan} subscriber={session.address} />}
          </>
        )}
      </section>
    </main>
  );
}
