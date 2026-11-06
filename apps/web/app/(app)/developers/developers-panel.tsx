"use client";

import { useExportWallet } from "@privy-io/react-auth";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { Address } from "viem";
import { useSession } from "@/lib/use-session";
import { WebhookSettings } from "./webhook-settings";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <pre className="well overflow-x-auto text-[13px]/[20px]">
        <code>{code}</code>
      </pre>
      <div>
        <CopyButton text={code} label={label} />
      </div>
    </div>
  );
}

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

function noChange() {
  return () => undefined;
}

function useSiteOrigin() {
  return useSyncExternalStore(
    noChange,
    () => window.location.origin,
    () => "",
  );
}

function serverCode(keyId: string, site: string) {
  return `import Settle from "settle-pay";

const settle = new Settle({
  keyId: "${keyId}",
  keySecret: process.env.SETTLE_KEY_SECRET,
  businessName: "Your business",
  baseUrl: "${site}",
});

// Create an order when the customer clicks Buy.
app.post("/orders", async (req, res) => {
  const order = await settle.orders.create({
    amount: "3.00",
    description: "Masala chai blend",
    receipt: "order_42",
  });
  res.json(order);
});

// Confirm the payment before you ship anything.
app.post("/verify", async (req, res) => {
  const payment = await settle.payments.verify(req.body);
  res.json(payment);
});`;
}

function browserCode(site: string) {
  return `<script src="${site}/checkout.js"></script>
<script>
  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => response.json());

  buyButton.onclick = () =>
    new Settle.Checkout({
      orderId: () => post("/orders").then((order) => order.id),
      handler: (response) => post("/verify", response),
    }).open();
</script>`;
}

const WEBHOOK_CODE = `// Express: keep the raw body, because the signature covers the exact bytes.
app.post("/webhooks/settle", express.raw({ type: "application/json" }), (req, res) => {
  const event = settle.webhooks.verify(
    req.body,
    req.headers["x-settle-signature"],
    process.env.SETTLE_WEBHOOK_SECRET,
  );
  if (event.type === "order.paid") fulfil(event.data.receipt);
  res.sendStatus(200);
});`;

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
        <p className="mt-1 text-muted">Add Settle to your own website and accept USDT there.</p>
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
          <CodeBlock code={serverCode(address, site)} label="Copy server code" />
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

      <section aria-label="Your website's payments" className="card flex flex-col gap-2 p-5">
        <h2 className="display text-xl">Where payments show up</h2>
        <p className="text-muted">
          Orders from your website appear under Invoices with your order reference. You can refund
          them and export them there, like any invoice.
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
