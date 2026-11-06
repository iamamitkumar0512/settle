import "server-only";
import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { and, eq } from "@arkiv-network/sdk/query";
import { addr, bytes, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { hexToBytes, hexToString, http, stringToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getGasPrice } from "viem/actions";
import { REGISTRY_ADDRESS } from "@/lib/contracts";
import type { CustomerInvoice, InvoiceCustomer } from "@/lib/customer-invoices";
import { customerLookup, normalizeEmail, walletLookup } from "./customer-lookup";
import { FILE_ENCRYPTION } from "./invoice-file";
import { payLinkKey } from "./pay-link";
import {
  decryptPrivateDetails,
  encryptPrivateDetails,
  type PrivateDetails,
} from "./private-details";

// Rabdi gas estimates can run low, so writes carry a fixed allowance well above the 135k measured.
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

type InvoiceRecordInput = PrivateDetails & {
  id: bigint;
  merchant: Address;
  amount: bigint;
  dueAt: bigint;
  merchantName: string;
  memo: string;
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

function memoFrom(publicDetails: Hex) {
  try {
    const { memo } = JSON.parse(hexToString(publicDetails)) as { memo?: unknown };
    return typeof memo === "string" ? memo : "";
  } catch {
    return "";
  }
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
    memo: memoFrom(row.public_details.value),
  };
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

export async function readMerchantCustomers(merchant: Address) {
  const customers: InvoiceCustomer[] = [];
  const reader = arkivReader();

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
      .where(and(eq("registry", addr(REGISTRY_ADDRESS)), eq("merchant", addr(merchant))))
      .createdBy(writerAccount().address)
      .limit(PAGE_SIZE)
      .offset(offset)
      .fetch();

    for (const row of page.entities) {
      const id = BigInt(row.invoice_id.value);
      // One unreadable record shouldn't hide the merchant's other customers.
      const details = await decryptPrivateDetails(
        id,
        hexToBytes(row.private_details.value),
        row.private_media_type.value,
      ).catch(() => null);
      customers.push({
        id: String(id),
        merchantName: row.merchant_name.value,
        memo: memoFrom(row.public_details.value),
        customerName: details?.customerName ?? "",
        customerEmail: details?.customerEmail ?? "",
        customerWallet: details?.customerWallet ?? "",
        linkKey: payLinkKey(id),
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
        });
      }
    }

    if (page.entities.length < PAGE_SIZE) return invoices;
  }
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

async function createRecord(input: InvoiceRecordInput) {
  const { id, merchant, amount, dueAt, merchantName, memo } = input;
  const { customerName, customerEmail, customerWallet, salt } = input;
  const { envelope, mediaType } = await encryptPrivateDetails(id, {
    customerName,
    customerEmail,
    customerWallet,
    salt,
  });

  const { wallet, transaction } = await writer();
  // Never retried here: resending after an uncertain result could write the record twice.
  return wallet.createEntity(
    InvoiceRecord,
    {
      registry: addr(REGISTRY_ADDRESS),
      invoice_id: u64(id),
      merchant: addr(merchant),
      due_at: u64(dueAt),
      customer_lookup: str(
        customerWallet ? walletLookup(customerWallet) : customerLookup(customerEmail),
      ),
      amount_usdt: u256(amount),
      merchant_name: str(merchantName),
      public_details: bytes(stringToBytes(JSON.stringify({ memo }))),
      private_details: bytes(envelope),
      private_media_type: str(mediaType),
    },
    { expiration: ExpirationTime.max(), flags: { readonly: true } },
    transaction,
  );
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
