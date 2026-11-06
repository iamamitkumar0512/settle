import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { formatUnits, isHash, parseEventLogs, type Address, type Hash } from "viem";
import { registry, USDT_DECIMALS } from "@/lib/contracts";
import {
  readInvoiceContact,
  readWebhook,
  webhookWasDelivered,
  writeWebhookDelivery,
} from "./arkiv";
import type { WebhookDetails } from "./private-details";
import { chainClient } from "./relayer";

const RETRY_DELAYS_MS = [0, 1_000, 3_000];
const TIMEOUT_MS = 5_000;

// Addresses a merchant must not be able to point Settle's server at.
const PRIVATE = new BlockList();
PRIVATE.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE.addAddress("::", "ipv6");
PRIVATE.addAddress("::1", "ipv6");
PRIVATE.addSubnet("fc00::", 7, "ipv6");
PRIVATE.addSubnet("fe80::", 10, "ipv6");

function isPrivateAddress(address: string) {
  // An IPv4 address written as IPv6 is judged as what it is.
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return PRIVATE.check(mapped[1], "ipv4");
  return PRIVATE.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

const isLocalTest = () => process.env.WEBHOOK_ALLOW_LOCAL === "true";

// Only a public https address may receive events. Checked when saved and again before each
// send, because what a name points at can change. Redirects are never followed.
export async function isSafeWebhookUrl(text: string) {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalTest() && host === "localhost") return true;
  if (url.protocol !== "https:") return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !isPrivateAddress(host);

  const addresses = await lookup(host, { all: true }).catch(() => []);
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
}

export function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhook(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export type WebhookEvent = {
  id: string;
  type: "order.paid" | "refund.created" | "webhook.test";
  created: string;
  data: Record<string, unknown>;
};

function decimal(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, USDT_DECIMALS).split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function eventId(hash: Hash, logIndex: number) {
  return `evt_${hash}_${logIndex}`;
}

type MerchantEvent = { merchant: Address; orderId: bigint; event: WebhookEvent };

// The events a transaction caused, built from the chain alone. Nothing a caller says can invent
// one, so any route may ask for a transaction to be announced.
async function transactionEvents(hash: Hash, origin: string): Promise<MerchantEvent[]> {
  const receipt = await chainClient.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt?.status !== "success") return [];
  const logs = parseEventLogs({
    abi: registry.abi,
    logs: receipt.logs.filter(
      ({ address }) => address.toLowerCase() === registry.address.toLowerCase(),
    ),
  });
  const block = await chainClient.getBlock({ blockHash: receipt.blockHash });
  const created = new Date(Number(block.timestamp) * 1000).toISOString();

  const events: MerchantEvent[] = [];
  for (const log of logs) {
    if (log.eventName !== "InvoicePaid" && log.eventName !== "InvoiceRefunded") continue;
    const { id, merchant, payer, amount } = log.args;
    const contact = await readInvoiceContact(id).catch(() => null);
    const order = {
      orderId: String(id),
      amount: decimal(amount),
      currency: "USDT",
      receipt: contact?.receipt ?? "",
      description: contact?.memo ?? "",
      payer,
      receiptUrl: `${origin}/pay/${id}/receipt`,
    };
    const shared = { id: eventId(hash, log.logIndex), created };
    if (log.eventName === "InvoicePaid") {
      const { relayFee } = log.args;
      const data = {
        ...order,
        paymentId: hash,
        received: decimal(amount - relayFee),
        networkFee: decimal(relayFee),
      };
      events.push({ merchant, orderId: id, event: { ...shared, type: "order.paid", data } });
    } else {
      const data = {
        ...order,
        refundId: hash,
        totalRefunded: decimal(log.args.totalRefunded),
      };
      events.push({ merchant, orderId: id, event: { ...shared, type: "refund.created", data } });
    }
  }
  return events;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sends an event with a few quick retries, then records what happened.
async function deliver(
  merchant: Address,
  webhook: WebhookDetails,
  event: WebhookEvent,
  orderId: bigint,
) {
  const body = JSON.stringify(event);
  let statusCode = 0;
  let attempts = 0;

  if (await isSafeWebhookUrl(webhook.url)) {
    for (const delay of RETRY_DELAYS_MS) {
      await wait(delay);
      attempts += 1;
      statusCode = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Settle-Webhooks/1.0",
          "X-Settle-Event": event.type,
          "X-Settle-Signature": signWebhook(body, webhook.secret),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).then(
        (response) => response.status,
        () => 0,
      );
      if (statusCode >= 200 && statusCode < 300) break;
    }
  }

  const delivered = statusCode >= 200 && statusCode < 300;
  await writeWebhookDelivery({
    merchant,
    eventId: event.id,
    eventType: event.type,
    orderId,
    delivered,
    statusCode,
    attempts,
  });
  return { delivered, statusCode, attempts };
}

// Tells a merchant's server about what a transaction did. Never throws: a payment has already
// happened by now, and a webhook problem must not touch it.
export async function announceTransaction(hash: Hash, origin: string) {
  try {
    for (const { merchant, orderId, event } of await transactionEvents(hash, origin)) {
      const webhook = await readWebhook(merchant);
      if (!webhook) continue;
      if (await webhookWasDelivered(merchant, event.id)) continue;
      await deliver(merchant, webhook, event, orderId);
    }
  } catch (error) {
    // The name only: messages can contain a keyed RPC URL.
    console.error("Announcing a transaction failed:", error instanceof Error ? error.name : "unknown");
  }
}

// Sends one past event again, when its merchant asks.
export async function resendEvent(merchant: Address, id: string, origin: string) {
  const hash = id.match(/^evt_(0x[0-9a-f]{64})_\d+$/)?.[1];
  if (!hash || !isHash(hash)) return null;
  const webhook = await readWebhook(merchant);
  if (!webhook) return null;

  const events = await transactionEvents(hash, origin);
  const found = events.find(({ event }) => event.id === id);
  if (!found || found.merchant.toLowerCase() !== merchant.toLowerCase()) return null;
  return deliver(merchant, webhook, found.event, found.orderId);
}

export function sendTestEvent(merchant: Address, webhook: WebhookDetails) {
  const event: WebhookEvent = {
    id: `evt_test_${randomBytes(8).toString("hex")}`,
    type: "webhook.test",
    created: new Date().toISOString(),
    data: { message: "Your webhook works." },
  };
  return deliver(merchant, webhook, event, 0n);
}
