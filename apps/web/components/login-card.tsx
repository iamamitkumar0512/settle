"use client";

import { useLoginWithEmail } from "@privy-io/react-auth";
import { useState, type FormEvent } from "react";
import { useConnect, useConnectors } from "wagmi";
import { useSession } from "@/lib/use-session";
import { isUserRejection } from "@/lib/wallet-errors";

function EmailLogin() {
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (codeSent) {
        await loginWithCode({ code: code.trim() });
      } else {
        await sendCode({ email: email.trim() });
        setCodeSent(true);
      }
    } catch {
      setError(
        codeSent
          ? "That code didn't work. Check it and try again."
          : "We couldn't send a code. Check your email address.",
      );
    }
    setBusy(false);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      {codeSent ? (
        <>
          <p className="text-muted">We sent a 6-digit code to {email}.</p>
          <label className="field">
            Code
            <input
              className="input figure text-[22px] tracking-[0.3em]"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        </>
      ) : (
        <label className="field">
          Email
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-wide" disabled={busy}>
        {busy ? "One moment…" : codeSent ? "Verify" : "Continue with email"}
      </button>
    </form>
  );
}

function WalletLogin() {
  const connectors = useConnectors();
  const connect = useConnect();
  const { signIn } = useSession();
  const [error, setError] = useState<string>();

  // Installed wallets announce themselves. The generic entry is the fallback when none do.
  const announced = connectors.filter((connector) => connector.id !== "injected");
  const options = announced.length > 0 ? announced : connectors;

  async function connectWith(connector: (typeof connectors)[number]) {
    setError(undefined);
    try {
      const { accounts } = await connect.mutateAsync({ connector });
      // One more signature proves the wallet is theirs, so private details can load.
      await signIn(accounts[0]).catch(() => undefined);
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      if (name === "ProviderNotFoundError") {
        setError("No wallet found. Install MetaMask or Rabby, or use your email.");
      } else if (isUserRejection(cause)) {
        setError("Connection cancelled.");
      } else {
        setError("Couldn't connect. Check your wallet and try again.");
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((connector) => (
        <button
          key={connector.uid}
          type="button"
          className="btn"
          disabled={connect.isPending}
          onClick={() => connectWith(connector)}
        >
          {connector.icon && (
            // The wallet supplies its own icon, often a data URI with stray whitespace, so it is
            // shown as given instead of going through Next's image checks.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={connector.icon.trim()} alt="" width={20} height={20} />
          )}
          {connector.id === "injected" ? "Browser wallet" : connector.name}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginCard({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[22px]/[30px]">{title}</h1>
      <EmailLogin />
      <div className="flex items-center gap-3 text-[13px]/[18px] text-muted">
        <span className="h-px flex-1 bg-line" />
        or use a wallet
        <span className="h-px flex-1 bg-line" />
      </div>
      <WalletLogin />
      <p className="text-center text-[13px]/[18px] text-muted">
        No gas needed either way. Settle covers network fees.
      </p>
    </div>
  );
}
