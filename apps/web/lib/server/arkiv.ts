import "server-only";
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, desc, eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { hexToBytes, hexToString, http, stringToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getGasPrice } from "viem/actions";
import { isValidCallbackUrl } from "@/lib/checkout";
import { REGISTRY_ADDRESS, SUBSCRIPTIONS_ADDRESS } from "@/lib/contracts";
import type { CustomerInvoice, InvoiceCustomer } from "@/lib/customer-invoices";
import type { PlanDetails } from "@/lib/subscription";
import { customerLookup, normalizeEmail, saleLookup, walletLookup } from "./customer-lookup";
import { FILE_ENCRYPTION } from "./invoice-file";
import { payLinkKey } from "./pay-link";
import {
  decryptAgentSale,
  decryptPrivateDetails,
  decryptWebhookDetails,
  encryptAgentSale,
  encryptPrivateDetails,
  encryptWebhookDetails,
  type PrivateDetails,
  type WebhookDetails,
} from "./private-details";

// Rabdi gas estimates can run low, so writes carry a fixed allowance. An invoice uses about 590k.
const WRITE_GAS = 1_800_000n;
const MAX_WRITE_COST_WEI = 2_000_000_000_000_000n;
const PAGE_SIZE = 100;

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

// A PDF attached to an invoice. The file itself is on Swarm, encrypted; this is where to find it.
// A separate entity, because invoice records are readonly and a PDF can be attached later.
const InvoiceFile = defineSchema("settle_invoice_file_v1", {
  registry: addr().indexed(),
  invoice_id: u64().indexed(),
  merchant: addr().indexed(),
  swarm_reference: str(),
  media_type: str(),
  size_bytes: u64(),
  encryption: str(),
});

type InvoiceFileInput = {
  id: bigint;
  merchant: Address;
  reference: string;
  size: number;
};

// A subscription plan's offer. Nothing here is private: anyone with the link may read it.
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

// Where a merchant's webhooks go. A save writes a new record and the newest one wins, so removing
// a webhook is a record with no address.
const WebhookRecord = defineSchema("settle_webhook_v1", {
  registry: addr().indexed(),
  merchant: addr().indexed(),
  saved_at: u64().indexed(),
  private_details: bytes(),
  private_media_type: str(),
});

// One try at sending an event. Merchants read these to see what reached their server, and Arkiv
// drops them after a week, so the log never needs cleaning up.
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

// A sale to an AI agent. It is saved before the payment is sent, so it proves only an attempt: the
// token's own record of the signature decides whether it was paid.
const AgentSaleEntity = defineSchema("settle_agent_sale_v1", {
  registry: addr().indexed(),
  merchant: addr().indexed(),
  receipt_lookup: str().indexed(),
  payment_nonce: str().indexed(),
  sold_at: u64().indexed(),
  payer: addr(),
  amount_usdt: u256(),
  network_fee: u256(),
  valid_before: u64(),
  chain_block: u64(),
  merchant_name: str(),
  private_details: bytes(),
  private_media_type: str(),
});

const DELIVERY_LOG_DAYS = 7;
const RECENT_DELIVERIES = 20;

export type WebhookDeliveryRecord = {
  eventId: string;
  eventType: string;
  orderId: string;
  delivered: boolean;
  statusCode: number;
  attempts: number;
  sentAt: string;
};

type PlanRecordInput = PlanDetails & {
  id: bigint;
  merchant: Address;
  amount: bigint;
  period: number;
};

type InvoiceRecordInput = PrivateDetails & {
  id: bigint;
  merchant: Address;
  amount: bigint;
  dueAt: bigint;
  merchantName: string;
  memo: string;
  callbackUrl?: string;
  kind?: "order";
};

function connection() {
  const accessKey = process.env.ARKIV_ACCESS_KEY;
  if (!accessKey) throw new Error("ARKIV_ACCESS_KEY is not configured");
  return {
    chain: rabdi({ accessKey }),
    transport: http(undefined, { timeout: 30_000, retryCount: 0 }),
  };
}

function writerAccount() {
  const key = process.env.ARKIV_PRIVATE_KEY;
  if (!key) throw new Error("ARKIV_PRIVATE_KEY is not configured");
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

function arkivReader() {
  return createPublicClient(connection());
}

function publicFrom(publicDetails: Hex) {
  try {
    const { memo, callbackUrl, order } = JSON.parse(hexToString(publicDetails)) as Record<
      string,
      unknown
    >;
    return {
      memo: typeof memo === "string" ? memo : "",
      isOrder: order === true,
      // Checked again on the way out: this is where a paying customer gets sent.
      ...(typeof callbackUrl === "string" && isValidCallbackUrl(callbackUrl) ? { callbackUrl } : {}),
    };
  } catch {
    return { memo: "", isOrder: false };
  }
}

function memoFrom(publicDetails: Hex) {
  return publicFrom(publicDetails).memo;
}

// Every read filters on our writer: anyone can create entities with this schema name.
export async function invoiceRecordExists(id: bigint) {
  const page = await arkivReader()
    .select({ $key: true })
    .from(InvoiceRecord)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("invoice_id", u64(id))))
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  return page.entities.length > 0;
}

export async function readPublicDetails(id: bigint) {
  const page = await arkivReader()
    .select({ merchant_name: true, public_details: true })
    .from(InvoiceRecord)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("invoice_id", u64(id))))
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row) return null;
  return {
    merchantName: row.merchant_name.value,
    ...publicFrom(row.public_details.value),
  };
}

// One invoice's details with its customer's contact, for the server's own use: it is never
// returned to a caller as it is.
export async function readInvoiceContact(id: bigint) {
  const page = await arkivReader()
    .select({
      merchant_name: true,
      public_details: true,
      private_details: true,
      private_media_type: true,
    })
    .from(InvoiceRecord)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("invoice_id", u64(id))))
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row) return null;

  const details = await decryptPrivateDetails(
    id,
    hexToBytes(row.private_details.value),
    row.private_media_type.value,
  ).catch(() => null);
  return {
    merchantName: row.merchant_name.value,
    memo: memoFrom(row.public_details.value),
    customerName: details?.customerName ?? "",
    customerEmail: details?.customerEmail ?? "",
    receipt: details?.receipt ?? "",
    isOrder: publicFrom(row.public_details.value).isOrder,
  };
}

// A merchant's webhook, or null if they have none. Only the server reads the secret from here.
export async function readWebhook(merchant: Address): Promise<WebhookDetails | null> {
  const page = await arkivReader()
    .select({ private_details: true, private_media_type: true })
    .from(WebhookRecord)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
    .createdBy(writerAccount().address)
    .orderBy(desc("saved_at"))
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row) return null;

  const details = await decryptWebhookDetails(
    merchant,
    hexToBytes(row.private_details.value),
    row.private_media_type.value,
  );
  return details.url ? details : null;
}

export async function readWebhookDeliveries(merchant: Address): Promise<WebhookDeliveryRecord[]> {
  const page = await arkivReader()
    .select({
      event_id: true,
      event_type: true,
      invoice_id: true,
      delivered: true,
      status_code: true,
      attempts: true,
      sent_at: true,
    })
    .from(WebhookDelivery)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
    .createdBy(writerAccount().address)
    .orderBy(desc("sent_at"))
    .limit(RECENT_DELIVERIES)
    .fetch();
  return page.entities.map((row) => ({
    eventId: row.event_id.value,
    eventType: row.event_type.value,
    orderId: String(row.invoice_id.value),
    delivered: BigInt(row.delivered.value) === 1n,
    statusCode: Number(row.status_code.value),
    attempts: Number(row.attempts.value),
    sentAt: new Date(Number(row.sent_at.value) * 1000).toISOString(),
  }));
}

// Whether an event already reached the merchant, so a second announcement sends nothing.
export async function webhookWasDelivered(merchant: Address, eventId: string) {
  const page = await arkivReader()
    .select({ $key: true })
    .from(WebhookDelivery)
    .where(
      and(
        eq("registry", addr(REGISTRY_ADDRESS)),
        eq("merchant", addr(merchant)),
        eq("event_id", str(eventId)),
        eq("delivered", u64(1n)),
      ),
    )
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  return page.entities.length > 0;
}

export async function readInvoiceFile(id: bigint) {
  const page = await arkivReader()
    .select({ swarm_reference: true, media_type: true, size_bytes: true })
    .from(InvoiceFile)
    .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("invoice_id", u64(id))))
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row) return null;
  return {
    reference: row.swarm_reference.value,
    mediaType: row.media_type.value,
    size: Number(row.size_bytes.value),
  };
}

function descriptionFrom(publicDetails: Hex) {
  try {
    const { description } = JSON.parse(hexToString(publicDetails)) as { description?: unknown };
    return typeof description === "string" ? description : "";
  } catch {
    return "";
  }
}

export async function planRecordExists(id: bigint) {
  const page = await arkivReader()
    .select({ $key: true })
    .from(PlanRecord)
    .where(and(eq("contract", addr(SUBSCRIPTIONS_ADDRESS)), eq("plan_id", u64(id))))
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  return page.entities.length > 0;
}

// The saved details of every plan, keyed by plan id.
export async function readPlanRecords() {
  const plans: Record<string, PlanDetails> = {};
  const reader = arkivReader();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reader
      .select({ plan_id: true, merchant_name: true, plan_name: true, public_details: true })
      .from(PlanRecord)
      .where(and(eq("contract", addr(SUBSCRIPTIONS_ADDRESS))))
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();
    for (const row of page.entities) {
      plans[String(BigInt(row.plan_id.value))] = {
        merchantName: row.merchant_name.value,
        name: row.plan_name.value,
        description: descriptionFrom(row.public_details.value),
      };
    }
    if (page.entities.length < PAGE_SIZE) return plans;
  }
}

// What anyone can see about a merchant: the name on their latest invoice, and which of their
// invoices are store orders. Both are public already, one record at a time.
export async function readMerchantProfile(merchant: Address) {
  const reader = arkivReader();
  let businessName = "";
  let latest = 0n;
  const orderIds: string[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reader
      .select({ invoice_id: true, merchant_name: true, public_details: true })
      .from(InvoiceRecord)
      .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();
    for (const row of page.entities) {
      const id = BigInt(row.invoice_id.value);
      if (publicFrom(row.public_details.value).isOrder) orderIds.push(String(id));
      if (id > latest) {
        latest = id;
        businessName = row.merchant_name.value;
      }
    }
    if (page.entities.length < PAGE_SIZE) return { businessName, orderIds };
  }
}

export async function readMerchantInvoiceIds(merchant: Address) {
  const ids: bigint[] = [];
  const reader = arkivReader();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reader
      .select({ invoice_id: true })
      .from(InvoiceRecord)
      .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();
    for (const row of page.entities) ids.push(BigInt(row.invoice_id.value));
    if (page.entities.length < PAGE_SIZE) return ids;
  }
}

export async function readMerchantCustomers(merchant: Address, id?: bigint) {
  const customers: InvoiceCustomer[] = [];
  const reader = arkivReader();
  const registry = eq("registry", addr(REGISTRY_ADDRESS));
  const owner = eq("merchant", addr(merchant));

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reader
      .select({
        invoice_id: true,
        merchant_name: true,
        public_details: true,
        private_details: true,
        private_media_type: true,
      })
      .from(InvoiceRecord)
      .where(
        id === undefined ? and(registry, owner) : and(registry, owner, eq("invoice_id", u64(id))),
      )
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();

    for (const row of page.entities) {
      const invoiceId = BigInt(row.invoice_id.value);
      // One unreadable record shouldn't hide the merchant's other customers.
      const details = await decryptPrivateDetails(
        invoiceId,
        hexToBytes(row.private_details.value),
        row.private_media_type.value,
      ).catch(() => null);
      customers.push({
        id: String(invoiceId),
        merchantName: row.merchant_name.value,
        memo: memoFrom(row.public_details.value),
        customerName: details?.customerName ?? "",
        customerEmail: details?.customerEmail ?? "",
        customerWallet: details?.customerWallet ?? "",
        receipt: details?.receipt ?? "",
        isOrder: publicFrom(row.public_details.value).isOrder,
        linkKey: payLinkKey(invoiceId),
      });
    }

    if (page.entities.length < PAGE_SIZE) return customers;
  }
}

// The email or the wallet address an invoice was sent to.
type BilledTo = { email: string } | { wallet: Address };

export async function readCustomerInvoices(customer: BilledTo) {
  const invoices: CustomerInvoice[] = [];
  const reader = arkivReader();
  const lookup = str(
    "email" in customer ? customerLookup(customer.email) : walletLookup(customer.wallet),
  );

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await reader
      .select({
        invoice_id: true,
        merchant_name: true,
        public_details: true,
        private_details: true,
        private_media_type: true,
      })
      .from(InvoiceRecord)
      .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("customer_lookup", lookup)))
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();

    for (const row of page.entities) {
      const id = BigInt(row.invoice_id.value);
      const details = await decryptPrivateDetails(
        id,
        hexToBytes(row.private_details.value),
        row.private_media_type.value,
      ).catch(() => null);
      // The lookup found the record; this confirms it against what is encrypted inside it.
      const isTheirs =
        details &&
        ("email" in customer
          ? normalizeEmail(details.customerEmail) === normalizeEmail(customer.email)
          : details.customerWallet.toLowerCase() === customer.wallet.toLowerCase());
      if (isTheirs) {
        invoices.push({
          id: String(id),
          merchantName: row.merchant_name.value,
          memo: memoFrom(row.public_details.value),
          isOrder: publicFrom(row.public_details.value).isOrder,
        });
      }
    }

    if (page.entities.length < PAGE_SIZE) return invoices;
  }
}

export type AgentSaleRecord = {
  merchant: Address;
  merchantName: string;
  payer: Address;
  nonce: Hex;
  amount: bigint;
  networkFee: bigint;
  validBefore: bigint;
  chainBlock: bigint;
  soldAt: bigint;
  receipt: string;
  description: string;
};

const SALE_COLUMNS = {
  merchant: true,
  merchant_name: true,
  payer: true,
  payment_nonce: true,
  amount_usdt: true,
  network_fee: true,
  valid_before: true,
  chain_block: true,
  sold_at: true,
  private_details: true,
  private_media_type: true,
} as const;

// A merchant's sales to agents, newest first, or just those for one order number.
export async function readAgentSaleRecords(merchant: Address, receipt?: string) {
  const base = arkivReader().select(SALE_COLUMNS).from(AgentSaleEntity);
  const scoped =
    receipt === undefined
      ? base.where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
      : base.where(
          and(
            eq("registry", addr(REGISTRY_ADDRESS)),
            eq("merchant", addr(merchant)),
            eq("receipt_lookup", str(saleLookup(merchant, receipt))),
          ),
        );
  const page = await scoped
    .createdBy(writerAccount().address)
    .orderBy(desc("sold_at"))
    .limit(PAGE_SIZE)
    .fetch();
  return Promise.all(page.entities.map(toAgentSale));
}

type SaleRow = Parameters<typeof toAgentSale>[0];

async function toAgentSale(row: {
  merchant: { value: string };
  merchant_name: { value: string };
  payer: { value: string };
  payment_nonce: { value: string };
  amount_usdt: { value: unknown };
  network_fee: { value: unknown };
  valid_before: { value: unknown };
  chain_block: { value: unknown };
  sold_at: { value: unknown };
  private_details: { value: Hex };
  private_media_type: { value: string };
}): Promise<AgentSaleRecord> {
  const nonce = row.payment_nonce.value as Hex;
  const details = await decryptAgentSale(
    nonce,
    hexToBytes(row.private_details.value),
    row.private_media_type.value,
  ).catch(() => ({ receipt: "", description: "" }));
  return {
    merchant: row.merchant.value as Address,
    merchantName: row.merchant_name.value,
    payer: row.payer.value as Address,
    nonce,
    amount: BigInt(String(row.amount_usdt.value)),
    networkFee: BigInt(String(row.network_fee.value)),
    validBefore: BigInt(String(row.valid_before.value)),
    chainBlock: BigInt(String(row.chain_block.value)),
    soldAt: BigInt(String(row.sold_at.value)),
    ...details,
  };
}

// The sale a payment's nonce belongs to. Most nonces belong to none: every token payment has one.
export async function readAgentSaleByNonce(nonce: Hex) {
  const page = await arkivReader()
    .select(SALE_COLUMNS)
    .from(AgentSaleEntity)
    .where(
      and(eq("registry", addr(REGISTRY_ADDRESS)), eq("payment_nonce", str(nonce.toLowerCase()))),
    )
    .createdBy(writerAccount().address)
    .limit(1)
    .fetch();
  const row: SaleRow | undefined = page.entities[0];
  return row ? toAgentSale(row) : null;
}

// One wallet has one nonce sequence, so writes in this process go one at a time.
let lastWrite: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(write: () => Promise<T>) {
  const next = lastWrite.then(write, write);
  lastWrite = next.catch(() => undefined);
  return next;
}

// The wallet client and the fixed gas settings every write uses.
async function writer() {
  const account = writerAccount();
  const reader = arkivReader();
  const [gasPrice, nonce] = await Promise.all([
    getGasPrice(reader),
    reader.getTransactionCount({ address: account.address, blockTag: "latest" }),
  ]);
  if (WRITE_GAS * gasPrice > MAX_WRITE_COST_WEI) {
    throw new Error("Arkiv gas price is above the write budget");
  }
  return {
    wallet: createWalletClient({ ...connection(), account }),
    transaction: { gas: WRITE_GAS, gasPrice, nonce },
  };
}

// Real lookups are 64 hex characters, so this can never match one.
const NO_CUSTOMER = "none";

async function createRecord(input: InvoiceRecordInput) {
  const { id, merchant, amount, dueAt, merchantName, memo, callbackUrl, kind } = input;
  const { customerName, customerEmail, customerWallet, receipt, salt } = input;
  const { envelope, mediaType } = await encryptPrivateDetails(id, {
    customerName,
    customerEmail,
    customerWallet,
    receipt,
    salt,
  });
  // A store's order may name no customer. Nobody can look such an order up by customer.
  let lookup = NO_CUSTOMER;
  if (customerWallet) lookup = walletLookup(customerWallet);
  else if (customerEmail) lookup = customerLookup(customerEmail);

  const { wallet, transaction } = await writer();
  // Never retried here: resending after an uncertain result could write the record twice.
  return wallet.createEntity(
    InvoiceRecord,
    {
      registry: addr(REGISTRY_ADDRESS),
      invoice_id: u64(id),
      merchant: addr(merchant),
      due_at: u64(dueAt),
      customer_lookup: str(lookup),
      amount_usdt: u256(amount),
      merchant_name: str(merchantName),
      public_details: bytes(
        stringToBytes(
          JSON.stringify({
            memo,
            ...(callbackUrl ? { callbackUrl } : {}),
            ...(kind === "order" ? { order: true } : {}),
          }),
        ),
      ),
      private_details: bytes(envelope),
      private_media_type: str(mediaType),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
}

async function createWebhookRecord(merchant: Address, details: WebhookDetails) {
  const { envelope, mediaType } = await encryptWebhookDetails(merchant, details);
  const { wallet, transaction } = await writer();
  // Never retried here, for the same reason as above.
  return wallet.createEntity(
    WebhookRecord,
    {
      registry: addr(REGISTRY_ADDRESS),
      merchant: addr(merchant),
      saved_at: u64(BigInt(Math.floor(Date.now() / 1000))),
      private_details: bytes(envelope),
      private_media_type: str(mediaType),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
}

export function writeWebhook(merchant: Address, details: WebhookDetails) {
  return oneAtATime(() => createWebhookRecord(merchant, details));
}

type DeliveryInput = {
  merchant: Address;
  eventId: string;
  eventType: string;
  orderId: bigint;
  delivered: boolean;
  statusCode: number;
  attempts: number;
};

async function createDeliveryRecord(input: DeliveryInput) {
  const { wallet, transaction } = await writer();
  // Never retried here, for the same reason as above.
  return wallet.createEntity(
    WebhookDelivery,
    {
      registry: addr(REGISTRY_ADDRESS),
      merchant: addr(input.merchant),
      event_id: str(input.eventId),
      delivered: u64(input.delivered ? 1n : 0n),
      sent_at: u64(BigInt(Math.floor(Date.now() / 1000))),
      event_type: str(input.eventType),
      invoice_id: u64(input.orderId),
      status_code: u64(BigInt(input.statusCode)),
      attempts: u64(BigInt(input.attempts)),
    },
    { expiration: ExpirationTime.fromDays(DELIVERY_LOG_DAYS), flags: { readonly: true } },
    transaction,
  );
}

type AgentSaleInput = Omit<AgentSaleRecord, "soldAt">;

async function createAgentSaleRecord(input: AgentSaleInput) {
  const nonce = input.nonce.toLowerCase();
  const { envelope, mediaType } = await encryptAgentSale(nonce, input);
  const { wallet, transaction } = await writer();
  // Never retried here, for the same reason as above.
  return wallet.createEntity(
    AgentSaleEntity,
    {
      registry: addr(REGISTRY_ADDRESS),
      merchant: addr(input.merchant),
      receipt_lookup: str(saleLookup(input.merchant, input.receipt)),
      payment_nonce: str(nonce),
      sold_at: u64(BigInt(Math.floor(Date.now() / 1000))),
      payer: addr(input.payer),
      amount_usdt: u256(input.amount),
      network_fee: u256(input.networkFee),
      valid_before: u64(input.validBefore),
      chain_block: u64(input.chainBlock),
      merchant_name: str(input.merchantName),
      private_details: bytes(envelope),
      private_media_type: str(mediaType),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
}

export function writeAgentSale(input: AgentSaleInput) {
  return oneAtATime(() => createAgentSaleRecord(input));
}

export function writeWebhookDelivery(input: DeliveryInput) {
  return oneAtATime(() => createDeliveryRecord(input));
}

export function writeInvoiceRecord(input: InvoiceRecordInput) {
  return oneAtATime(() => createRecord(input));
}

async function createFileRecord({ id, merchant, reference, size }: InvoiceFileInput) {
  const { wallet, transaction } = await writer();
  // Never retried here, for the same reason as above.
  return wallet.createEntity(
    InvoiceFile,
    {
      registry: addr(REGISTRY_ADDRESS),
      invoice_id: u64(id),
      merchant: addr(merchant),
      swarm_reference: str(reference),
      media_type: str("application/pdf"),
      size_bytes: u64(BigInt(size)),
      encryption: str(FILE_ENCRYPTION),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
}

export function writeInvoiceFile(input: InvoiceFileInput) {
  return oneAtATime(() => createFileRecord(input));
}

async function createPlanRecord(input: PlanRecordInput) {
  const { id, merchant, amount, period, merchantName, name, description } = input;
  const { wallet, transaction } = await writer();
  // Never retried here, for the same reason as above.
  return wallet.createEntity(
    PlanRecord,
    {
      contract: addr(SUBSCRIPTIONS_ADDRESS),
      plan_id: u64(id),
      merchant: addr(merchant),
      amount_usdt: u256(amount),
      period_seconds: u64(BigInt(period)),
      merchant_name: str(merchantName),
      plan_name: str(name),
      public_details: bytes(stringToBytes(JSON.stringify({ description }))),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
}

export function writePlanRecord(input: PlanRecordInput) {
  return oneAtATime(() => createPlanRecord(input));
}
