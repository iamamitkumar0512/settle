"use client";

import { useExportWallet } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { CodeBlock, CopyButton } from "@/components/code-block";
import {
  AGENT_CLIENT_CODE,
  AGENT_SERVER_CODE,
  browserCode,
  serverCode,
  WEBHOOK_CODE,
} from "@/lib/integration-snippets";
import { useSession } from "@/lib/use-session";
import { useSiteOrigin } from "@/lib/use-site-origin";
import { WebhookSettings } from "./webhook-settings";

// Privy shows the key in a window on its own domain, so this page and Settle never see it.
function RevealSecret({ address }: { address: Address }) {
  const { exportWallet } = useExportWallet();
  const [failed, setFailed] = useState(false);

  async function reveal() {
    setFailed(false);
    await exportWallet({ address }).catch(() => setFailed(true));
  }

  return (
    <>
      <div>
        <button type="button" className="btn" onClick={reveal}>
          Reveal key secret
        </button>
      </div>
      {failed && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          We couldn&apos;t open your key secret. Log out, log in again and retry.
        </p>
      )}
      <p className="text-[13px]/[18px] text-muted">
        It opens in a secure window from our login provider. Settle never sees it or stores it.
      </p>
    </>
  );
}

export function DevelopersPanel() {
  const { address, kind } = useSession();
  const site = useSiteOrigin();
  if (!address) return null;

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display text-4xl/11">Developers</h1>
          <span className="pill tone-due">Test mode</span>
        </div>
        <p className="mt-1 text-muted">
          Add Settle to your own website and accept USDT there.{" "}
          <Link href="/docs" className="text-accent-text">
            Read the full guide
          </Link>
        </p>
      </div>

      <section aria-label="API keys" className="card flex flex-col gap-4 p-5">
        <h2 className="display text-xl">API keys</h2>
        <div className="flex flex-col gap-2">
          <div className="label">Key ID</div>
          <div className="figure text-[13px]/[18px] break-all">{address}</div>
          <div>
            <CopyButton text={address} label="Copy key ID" />
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="label">Key secret</div>
          <p>
            It can move this account&apos;s money, so keep it on your server and never in a browser.
            Use a separate Settle account for each store.
          </p>
          {kind === "email" ? (
            <RevealSecret address={address} />
          ) : (
            <p className="text-[13px]/[18px] text-muted">
              You logged in with a browser wallet, so your key secret is that wallet&apos;s private
              key. Only your wallet can show it, and Settle never sees it. Use a wallet you keep
              just for this store, not your main one.
            </p>
          )}
        </div>
      </section>

      <section aria-label="Add Settle to your website" className="card flex flex-col gap-4 p-5">
        <h2 className="display text-xl">Add Settle to your website</h2>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">1. Install</h3>
          <CodeBlock code="npm install settle-pay" label="Copy command" />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">2. On your server</h3>
          <CodeBlock code={serverCode(`"${address}"`, site)} label="Copy server code" />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">3. In your page</h3>
          <CodeBlock code={browserCode(site)} label="Copy page code" />
          <p className="text-[13px]/[18px] text-muted">
            Checkout opens in its own window, so your customer stays on your site. They pay with an
            email address and need no wallet.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">4. Get told by webhook</h3>
          <CodeBlock code={WEBHOOK_CODE} label="Copy webhook code" />
          <p className="text-[13px]/[18px] text-muted">
            A webhook reaches you even if the customer closes their browser. An event can arrive more
            than once, so use its id to act on it only once.
          </p>
        </div>
      </section>

      <WebhookSettings address={address} />

      <section aria-label="Sell to AI agents" className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="display text-xl">Sell to AI agents</h2>
          <p className="text-[13px]/[18px] text-muted">
            Put a price on one route, and an AI agent can buy from you over x402 with no account and
            no API key. The network fee comes out of the sale, and each order lands on your Invoices
            page and at your webhook like any other.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">On your server</h3>
          <CodeBlock code={AGENT_SERVER_CODE} label="Copy server code" />
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="font-semibold">What the agent runs</h3>
          <CodeBlock code={AGENT_CLIENT_CODE} label="Copy agent code" />
        </div>
      </section>

      <section aria-label="Your website's payments" className="card flex flex-col gap-2 p-5">
        <h2 className="display text-xl">Where payments show up</h2>
        <p className="text-muted">
          Orders from your website appear under Invoices with your order reference, where you can
          refund and export them like any invoice. Sales to AI agents appear there too, and
          subscription payments count towards what you have collected.
        </p>
        <div>
          <Link href="/dashboard" className="btn">
            See your invoices
          </Link>
        </div>
      </section>
    </main>
  );
}
