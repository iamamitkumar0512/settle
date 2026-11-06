"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { formatDateTime } from "@/lib/format";
import { postJson } from "@/lib/relay-client";
import { useSession } from "@/lib/use-session";

type Delivery = {
  eventId: string;
  eventType: string;
  orderId: string;
  delivered: boolean;
  statusCode: number;
  attempts: number;
  sentAt: string;
};

type Settings = {
  webhook: { url: string; secret: string } | null;
  deliveries: Delivery[];
};

const ERRORS: Record<string, string> = {
  invalid_webhook_url: "Enter a public https address.",
  log_in_again: "Your session ended. Log in again.",
  too_many_requests: "Too many requests. Wait a minute and try again.",
  network: "We couldn't reach Settle. Check your connection.",
};

function deliveryLabel({ delivered, statusCode }: Delivery) {
  if (delivered) return `Delivered · ${statusCode}`;
  return statusCode ? `Failed · ${statusCode}` : "No response";
}

function Deliveries({
  deliveries,
  busy,
  onResend,
}: {
  deliveries: Delivery[];
  busy: boolean;
  onResend: (eventId: string) => void;
}) {
  // A failure that was resent successfully needs nothing more.
  const reached = new Set(deliveries.filter(({ delivered }) => delivered).map((row) => row.eventId));

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="font-semibold">Recent deliveries</h3>
      {deliveries.length === 0 ? (
        <p className="text-[13px]/[18px] text-muted">
          Nothing sent yet. Send a test event to try it.
        </p>
      ) : (
        <ul aria-label="Recent deliveries" className="flex flex-col gap-2">
          {deliveries.map((delivery) => (
            <li
              key={`${delivery.eventId}-${delivery.sentAt}`}
              className="well flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
            >
              <div className="min-w-0">
                <div className="figure text-[13px]/[18px]">{delivery.eventType}</div>
                <div className="text-[13px]/[18px] text-muted">
                  {delivery.orderId !== "0" && `Order #${delivery.orderId} · `}
                  {formatDateTime(new Date(delivery.sentAt))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`pill ${delivery.delivered ? "tone-paid" : "tone-late"}`}>
                  {deliveryLabel(delivery)}
                </span>
                {!reached.has(delivery.eventId) && delivery.eventType !== "webhook.test" && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => onResend(delivery.eventId)}
                  >
                    Resend
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px]/[18px] text-muted">Deliveries are kept for 7 days.</p>
    </div>
  );
}

// Where Settle sends order.paid and refund.created, and what reached the merchant's server.
export function WebhookSettings({ address }: { address: Address }) {
  const session = useSession();
  const { credentials } = session;
  const queryClient = useQueryClient();
  const queryKey = ["webhook", address, credentials];
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [confirming, setConfirming] = useState<"roll" | "remove">();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();

  const settings = useQuery({
    queryKey,
    enabled: Boolean(credentials),
    refetchInterval: 15_000,
    queryFn: async () => {
      const result = await postJson("/api/developers/webhook", {
        credentials,
        merchant: address,
        action: "read",
      });
      if (!result.ok) throw new Error(result.error);
      return result.data as unknown as Settings;
    },
  });

  async function act(action: string, extra: object = {}) {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    setConfirming(undefined);
    const result = await postJson("/api/developers/webhook", {
      credentials,
      merchant: address,
      action,
      ...extra,
    });
    if (result.ok && result.data.webhook !== undefined) {
      queryClient.setQueryData(queryKey, result.data);
    } else {
      await queryClient.invalidateQueries({ queryKey });
    }
    setBusy(false);
    if (!result.ok) {
      setError(ERRORS[result.error] ?? "That didn't work. Try again.");
      return null;
    }
    return result.data;
  }

  async function save() {
    if (await act("save", { url })) {
      setEditing(false);
      setUrl("");
    }
  }

  async function sendTest() {
    const data = await act("test");
    const result = data?.result as { delivered: boolean; statusCode: number } | undefined;
    if (!result) return;
    setNote(
      result.delivered
        ? "Test event delivered."
        : `Your server didn't accept it${result.statusCode ? ` (${result.statusCode})` : ""}.`,
    );
  }

  const webhook = settings.data?.webhook;
  const secret = webhook?.secret ?? "";

  return (
    <section aria-label="Webhooks" className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="display text-xl">Webhooks</h2>
        <p className="mt-1 text-muted">
          Settle tells your server when an order is paid or refunded, even if your customer closes
          their browser first.
        </p>
      </div>

      {!credentials ? (
        <div className="well flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px]/[18px] text-muted">
            Sign one message to see your webhook settings. It costs no gas.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => session.signIn().catch(() => undefined)}
          >
            Show webhooks
          </button>
        </div>
      ) : settings.isPending ? (
        <p className="text-muted">Loading…</p>
      ) : settings.isError ? (
        <p role="alert" className="text-late">
          We couldn&apos;t load your webhook settings. Refresh to try again.
        </p>
      ) : !webhook || editing ? (
        <div className="flex flex-col gap-3">
          <label className="field">
            Your server&apos;s address
            <input
              className="input figure text-sm"
              type="url"
              autoComplete="off"
              placeholder="https://your-store.example/webhooks/settle"
              disabled={busy}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !url.trim()}
              onClick={save}
            >
              {busy ? "Saving…" : "Save webhook"}
            </button>
            {editing && (
              <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="label">Address</div>
            <div className="figure mt-1 text-[13px]/[18px] break-all">{webhook.url}</div>
          </div>
          <div>
            <div className="label">Signing secret</div>
            <div className="figure mt-1 text-[13px]/[18px] break-all">
              {showSecret ? secret : `${secret.slice(0, 6)}${"•".repeat(16)}`}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? "Hide secret" : "Show secret"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard.writeText(secret)}
              >
                Copy secret
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={sendTest}>
              {busy ? "Working…" : "Send test event"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setUrl(webhook.url);
                setEditing(true);
              }}
            >
              Change address
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConfirming("roll")}
            >
              New secret
            </button>
            <button
              type="button"
              className="btn text-late"
              disabled={busy}
              onClick={() => setConfirming("remove")}
            >
              Remove
            </button>
          </div>
          {confirming && (
            <div className="well flex flex-col gap-3">
              <p className="text-[13px]/[18px]">
                {confirming === "roll"
                  ? "Your server will refuse events until it has the new secret."
                  : "Settle will stop sending events to your server."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn flex-1"
                  onClick={() => setConfirming(undefined)}
                >
                  Keep it
                </button>
                <button
                  type="button"
                  className="btn flex-1 text-late"
                  onClick={() => {
                    if (confirming === "remove") setShowSecret(false);
                    void act(confirming);
                  }}
                >
                  {confirming === "roll" ? "Yes, new secret" : "Yes, remove"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {note && (
        <p role="status" className="text-[13px]/[18px] text-muted">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
      {webhook && !editing && (
        <Deliveries
          deliveries={settings.data?.deliveries ?? []}
          busy={busy}
          onResend={(eventId) => act("resend", { eventId })}
        />
      )}
    </section>
  );
}
