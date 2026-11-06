// Lists Settle's public invoice records on Arkiv. Needs only a free access key:
//   ARKIV_ACCESS_KEY=<key> node apps/web/scripts/arkiv-query.mjs [registry address]
// Encrypted customer fields are returned as stored, so this script can't read them.
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { formatUnits, hexToString, http } from "viem";

const WRITER = "0x7d404608B53998044fDDf5d07f6da8092d155278";
const LIVE_REGISTRY = "0x7ac2BbccfF3156ee4f36E41b5091e2b7E02E21bA";

const InvoiceRecord = defineSchema("settle_invoice_v1", {
  registry: addr().indexed(),
  invoice_id: u64().indexed(),
  merchant: addr().indexed(),
  due_at: u64().indexed(),
  amount_usdt: u256(),
  merchant_name: str(),
  public_details: bytes(),
  private_details: bytes(),
  private_media_type: str(),
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

console.log(JSON.stringify({ registry, writer: WRITER, count: rows.length, rows }, null, 2));
