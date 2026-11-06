"use client";

import { useState, type FormEvent } from "react";
import { formatUnits, isAddress, type Address, type Hash } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { AddUsdt } from "@/components/add-usdt";
import { whitechainSepolia } from "@/lib/chains";
import { usdtAbi, USDT_ADDRESS, USDT_DECIMALS } from "@/lib/contracts";
import { explorerTxUrl, formatUsdt } from "@/lib/format";
import { newSalt, parseUsdtAmount } from "@/lib/invoice";
import { postJson, splitSignature } from "@/lib/relay-client";
import { withdrawAuthorization } from "@/lib/typed-data";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";
import { useUsdtBalance } from "@/lib/use-usdt-balance";
import { isInsufficientGas, isUserRejection } from "@/lib/wallet-errors";

function Withdraw({ address, balance }: { address: Address; balance: bigint }) {
  const session = useSession();
  const quote = useRelayQuote();
  const action = useSignedAction();
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const write = useWriteContract();
  const [to, setTo] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paysOwnGas, setPaysOwnGas] = useState(false);
  const [directStage, setDirectStage] = useState<"idle" | "wallet" | "confirming">("idle");
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<Hash>();

  const isWallet = session.kind === "wallet";
  // A wallet can always pay its own gas. An email account can't, so it needs the relayer.
  const direct = isWallet && (paysOwnGas || !quote.available);
  const fee = direct ? 0n : quote.withdrawFee;
  const amount = parseUsdtAmount(amountText);
  const busy = action.busy || directStage !== "idle";

  async function sendDirect(recipient: Address, value: bigint) {
    setDirectStage("wallet");
    try {
      const hash = await write.mutateAsync({
        address: USDT_ADDRESS,
        abi: usdtAbi,
        chainId: whitechainSepolia.id,
        functionName: "transfer",
        args: [recipient, value],
      });
      setDirectStage("confirming");
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("reverted");
      return hash;
    } catch (cause) {
      if (isUserRejection(cause)) setError("You cancelled in your wallet. Nothing was sent.");
      else if (isInsufficientGas(cause)) setError("This wallet doesn't have enough WBT for gas.");
      else setError("The transfer didn't go through. Check your wallet before trying again.");
      return null;
    } finally {
      setDirectStage("idle");
    }
  }

  async function sendGasless(recipient: Address, value: bigint) {
    const request = { from: address, to: recipient, amount: value, fee, salt: newSalt() };
    const typed = withdrawAuthorization(request);
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/withdraw", {
        ...request,
        validAfter: typed.message.validAfter,
        validBefore: typed.message.validBefore,
        ...splitSignature(signature),
      }),
    );
    return data ? (data.txHash as Hash) : null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSent(undefined);
    action.clearError();

    if (!isAddress(to)) return setError("Enter a valid wallet address.");
    if (amount === null) return setError("Enter an amount above 0, with up to 6 decimals.");
    if (amount > balance) return setError(`You have ${formatUsdt(balance)} USDT.`);
    if (amount <= fee) return setError(`Enter more than the ${formatUsdt(fee)} USDT fee.`);
    setError(undefined);

    const hash = direct ? await sendDirect(to, amount) : await sendGasless(to, amount);
    if (hash) {
      setSent(hash);
      setAmountText("");
    }
  }

  if (quote.isPending) return <p className="text-muted">Loading…</p>;
  if (!isWallet && !quote.available) {
    return (
      <p role="alert" className="text-late">
        Settle can&apos;t send USDT right now. Your balance is safe. Try again later.
      </p>
    );
  }

  let buttonLabel = action.label("Send USDT", "Sending…");
  if (directStage === "wallet") buttonLabel = "Confirm in your wallet";
  if (directStage === "confirming") buttonLabel = "Sending…";

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <label className="field">
        Send to
        <input
          className="input figure text-sm"
          type="text"
          autoComplete="off"
          placeholder="0x…"
          disabled={busy}
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
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
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
          />
          <button
            type="button"
            className="btn figure absolute right-[7px] top-[7px] min-h-[38px] px-2.5 text-xs"
            disabled={busy}
            onClick={() => setAmountText(formatUnits(balance, USDT_DECIMALS))}
          >
            Max
          </button>
        </span>
      </label>
      {isWallet && quote.available && (
        <label className="flex items-center gap-2.5 text-[13px]/[18px]">
          <input
            type="checkbox"
            disabled={busy}
            checked={paysOwnGas}
            onChange={(event) => setPaysOwnGas(event.target.checked)}
          />
          Pay the gas from my wallet in WBT instead
        </label>
      )}
      <div className="well flex flex-col gap-1.5 text-[13px]/[18px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted">{direct ? "Gas" : "Network fee, repays the gas"}</span>
          <span className="figure">{direct ? "Paid by your wallet" : `${formatUsdt(fee)} USDT`}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted">They receive</span>
          <span className="figure">
            {amount !== null && amount > fee ? `${formatUsdt(amount - fee)} USDT` : "—"}
          </span>
        </div>
      </div>
      {(error ?? action.error) && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error ?? action.error}
        </p>
      )}
      {sent && (
        <p role="status" className="text-[13px]/[18px] text-paid">
          Sent.{" "}
          <a className="underline" href={explorerTxUrl(sent)} target="_blank" rel="noreferrer">
            View transaction ↗
          </a>
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
        {buttonLabel}
      </button>
      <p className="text-[13px]/[18px] text-muted">
        Use an address on Whitechain, such as your exchange account. A transfer can&apos;t be undone.
      </p>
    </form>
  );
}

export function AccountPanel() {
  const session = useSession();
  const { data: balance } = useUsdtBalance(session.address);
  if (!session.address) return null;
  const address = session.address;

  return (
    <>
      <section className="card flex flex-col gap-4 p-6">
        <div className="label">Balance</div>
        <div className="figure text-[40px]/[48px] tracking-tight">
          {balance === undefined ? "—" : formatUsdt(balance)}{" "}
          <span className="text-base text-muted">USDT</span>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4 text-[13px]/[18px]">
          {session.email && (
            <div className="flex justify-between gap-4">
              <span className="text-muted">Email</span>
              <span>{session.email}</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-muted">Logged in with</span>
            <span>{session.kind === "email" ? "Email" : "Browser wallet"}</span>
          </div>
        </div>
      </section>

      <section aria-label="Add money" className="card flex flex-col gap-4 p-6">
        <h2 className="display text-xl">Add money</h2>
        <AddUsdt address={address} />
      </section>

      <section aria-label="Withdraw" className="card flex flex-col gap-4 p-6">
        <h2 className="display text-xl">Withdraw</h2>
        {balance === undefined ? (
          <p className="text-muted">Checking your balance…</p>
        ) : (
          <Withdraw address={address} balance={balance} />
        )}
      </section>
    </>
  );
}
