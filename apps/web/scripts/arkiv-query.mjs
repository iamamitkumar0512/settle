// Lists Settle's public records on Arkiv: invoices, the PDFs attached to them, subscription
// plans, and recent webhook deliveries with the days each has left. Needs only a free access key:
//   ARKIV_ACCESS_KEY=<key> node apps/web/scripts/arkiv-query.mjs [registry] [subscriptions]
// Encrypted customer fields are returned as stored, so this script can't read them. A PDF's
// Swarm reference is public, but the bytes behind it are encrypted too.
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { formatUnits, hexToString, http } from "viem";

const WRITER = "0x7d404608B53998044fDDf5d07f6da8092d155278";
const LIVE_REGISTRY = "0x4c6F09e112CaF53f2922b382DafD8Aa95826628F";
const LIVE_SUBSCRIPTIONS = "0x9dcBde22A2aD70249f188d649236b788DDBd4C61";

const InvoiceRecord = defineSchema("settle_invoice_v2", {
  registry: addr().indexed(),
  invoice_id: u64().indexed(),
  merchant: addr().indexed(),
  due_at: u64().indexed(),
  customer_lookup: str().indexed(),
  amount_usdt: u256(),
  merchant_name: str(),
  public_details: bytes(),
  private_details: bytes(),
  private_media_type: str(),
});

const InvoiceFile = defineSchema("settle_invoice_file_v1", {
  registry: addr().indexed(),
  invoice_id: u64().indexed(),
  merchant: addr().indexed(),
  swarm_reference: str(),
  media_type: str(),
  size_bytes: u64(),
  encryption: str(),
});

const PlanRecord = defineSchema("settle_plan_v1", {
  contract: addr().indexed(),
  plan_id: u64().indexed(),
  merchant: addr().indexed(),
  amount_usdt: u256(),
  period_seconds: u64(),
  merchant_name: str(),
  plan_name: str(),
  public_details: bytes(),
});

// One try at sending a webhook. These expire after 7 days, so the log cleans itself up.
const WebhookDelivery = defineSchema("settle_webhook_delivery_v1", {
  registry: addr().indexed(),
  merchant: addr().indexed(),
  event_id: str().indexed(),
  delivered: u64().indexed(),
  sent_at: u64().indexed(),
  event_type: str(),
  invoice_id: u64(),
  status_code: u64(),
  attempts: u64(),
});

const accessKey = process.env.ARKIV_ACCESS_KEY;
if (!accessKey) {
  console.error("Set ARKIV_ACCESS_KEY. Get a free key at https://hub.arkiv.network/access-keys");
  process.exit(1);
}

const client = createPublicClient({
  chain: rabdi({ accessKey }),
  transport: http(undefined, { timeout: 30_000, retryCount: 0 }),
});

const registry = process.argv[2] ?? LIVE_REGISTRY;
const subscriptions = process.argv[3] ?? LIVE_SUBSCRIPTIONS;

const page = await client
  .select({
    $key: true,
    $creator: true,
    $expiresAt: true,
    $creationFlags: true,
    invoice_id: true,
    merchant: true,
    due_at: true,
    amount_usdt: true,
    merchant_name: true,
    public_details: true,
    private_details: true,
  })
  .from(InvoiceRecord)
  .where(and(eq("registry", addr(registry))))
  .createdBy(WRITER)
  .orderBy(desc("invoice_id"))
  .limit(20)
  .fetch();

const rows = page.entities.map((row) => ({
  entityKey: row.$key,
  invoiceId: String(row.invoice_id.value),
  merchant: row.merchant.value,
  merchantName: row.merchant_name.value,
  amountUsdt: formatUnits(BigInt(row.amount_usdt.value), 6),
  dueAt: new Date(Number(row.due_at.value) * 1000).toISOString(),
  publicDetails: hexToString(row.public_details.value),
  encryptedBytes: (row.private_details.value.length - 2) / 2,
  readonly: row.$creationFlags.readonly,
  expiresAtBlock: String(row.$expiresAt),
}));

const filePage = await client
  .select({
    $key: true,
    invoice_id: true,
    swarm_reference: true,
    media_type: true,
    size_bytes: true,
    encryption: true,
  })
  .from(InvoiceFile)
  .where(and(eq("registry", addr(registry))))
  .createdBy(WRITER)
  .orderBy(desc("invoice_id"))
  .limit(20)
  .fetch();

const files = filePage.entities.map((row) => ({
  entityKey: row.$key,
  invoiceId: String(row.invoice_id.value),
  swarmReference: row.swarm_reference.value,
  mediaType: row.media_type.value,
  sizeBytes: String(row.size_bytes.value),
  encryption: row.encryption.value,
}));

const planPage = await client
  .select({
    $key: true,
    plan_id: true,
    merchant: true,
    amount_usdt: true,
    period_seconds: true,
    merchant_name: true,
    plan_name: true,
    public_details: true,
  })
  .from(PlanRecord)
  .where(and(eq("contract", addr(subscriptions))))
  .createdBy(WRITER)
  .limit(20)
  .fetch();

const plans = planPage.entities.map((row) => ({
  entityKey: row.$key,
  planId: String(row.plan_id.value),
  merchant: row.merchant.value,
  merchantName: row.merchant_name.value,
  planName: row.plan_name.value,
  amountUsdt: formatUnits(BigInt(row.amount_usdt.value), 6),
  periodSeconds: String(row.period_seconds.value),
  publicDetails: hexToString(row.public_details.value),
}));

const deliveryPage = await client
  .select({
    $expiresAt: true,
    merchant: true,
    event_type: true,
    invoice_id: true,
    delivered: true,
    status_code: true,
    sent_at: true,
  })
  .from(WebhookDelivery)
  .where(and(eq("registry", addr(registry))))
  .createdBy(WRITER)
  .orderBy(desc("sent_at"))
  .limit(10)
  .fetch();
const currentBlock = await client.getBlockNumber();

const deliveries = deliveryPage.entities.map((row) => ({
  merchant: row.merchant.value,
  eventType: row.event_type.value,
  invoiceId: String(row.invoice_id.value),
  delivered: BigInt(row.delivered.value) === 1n,
  statusCode: Number(row.status_code.value),
  sentAt: new Date(Number(row.sent_at.value) * 1000).toISOString(),
  // Rabdi makes a block every 2 seconds.
  daysLeft: ((Number(BigInt(String(row.$expiresAt)) - currentBlock) * 2) / 86_400).toFixed(2),
}));

console.log(
  JSON.stringify(
    { registry, subscriptions, writer: WRITER, count: rows.length, rows, files, plans, deliveries },
    null,
    2,
  ),
);
