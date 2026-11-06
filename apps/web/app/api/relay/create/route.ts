import { parseEventLogs } from "viem";
import { registry } from "@/lib/contracts";
import { hashInvoiceDetails, InvoiceStatus } from "@/lib/invoice";
import { readMerchantInvoiceIds, writeInvoiceRecord } from "@/lib/server/arkiv";
import { coversNewRequest, relayFees } from "@/lib/server/gas-fee";
import { parseInvoiceDetails } from "@/lib/server/invoice-details";
import { payLinkKey } from "@/lib/server/pay-link";
import {
  addressField,
  bytes32Field,
  relayRoute,
  signatureField,
  uintField,
} from "@/lib/server/relay-http";
import {
  chainClient,
  MIN_INVOICE,
  relay,
  RelayError,
  spendFreeRelay,
} from "@/lib/server/relayer";

export const maxDuration = 60;

const CREATES_PER_DAY = 50;
// A merchant who has never been paid can only keep this many invoices open.
const OPEN_ALLOWANCE = 5;

async function checkOpenAllowance(merchant: `0x${string}`) {
  const ids = await readMerchantInvoiceIds(merchant);
  if (ids.length < OPEN_ALLOWANCE) return;

  const rows = await chainClient.multicall({
    allowFailure: false,
    contracts: ids.map(
      (id) =>
        ({
          address: registry.address,
          abi: registry.abi,
          functionName: "invoices",
          args: [id],
        }) as const,
    ),
  });
  const statuses = rows.map((row) => row[6]);
  const everPaid = statuses.some(
    (status) => status === InvoiceStatus.Paid || status === InvoiceStatus.Refunded,
  );
  const open = statuses.filter((status) => status === InvoiceStatus.Open).length;
  if (!everPaid && open >= OPEN_ALLOWANCE) throw new RelayError(429, "open_invoice_limit");
}

// Creates an invoice the merchant signed, then saves its details, in one request.
export async function POST(request: Request) {
  return relayRoute(request, async (body) => {
    const fields = (body.request ?? {}) as Record<string, unknown>;
    const invoice = {
      merchant: addressField(fields.merchant),
      amount: uintField(fields.amount),
      dueAt: uintField(fields.dueAt),
      ref: bytes32Field(fields.ref),
      relayFee: uintField(fields.relayFee),
      salt: bytes32Field(fields.salt),
      deadline: uintField(fields.deadline),
    };
    const signature = signatureField(body.signature);

    const details = parseInvoiceDetails(body.details);
    if (!details) throw new RelayError(400, "invalid_details");
    const { salt: detailsSalt, ...detailFields } = details;
    if (hashInvoiceDetails(detailFields, detailsSalt) !== invoice.ref) {
      throw new RelayError(400, "details_mismatch");
    }

    if (invoice.amount < MIN_INVOICE) throw new RelayError(400, "invoice_too_small");
    const { payFee } = await relayFees();
    if (!coversNewRequest(invoice.relayFee, payFee)) {
      throw new RelayError(400, "relay_fee_too_low");
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (invoice.deadline < now + 60n || invoice.deadline > now + 3600n) {
      throw new RelayError(400, "invalid_window");
    }

    await checkOpenAllowance(invoice.merchant);
    spendFreeRelay("create", invoice.merchant, CREATES_PER_DAY);

    const { hash, receipt } = await relay({
      address: registry.address,
      abi: registry.abi,
      functionName: "createFor",
      args: [invoice, signature],
    });
    const [created] = parseEventLogs({
      abi: registry.abi,
      eventName: "InvoiceCreated",
      logs: receipt.logs,
    });
    const id = created.args.id;

    // The invoice exists on-chain either way. If saving fails, the client can retry it.
    const saved = await writeInvoiceRecord({
      ...details,
      id,
      merchant: invoice.merchant,
      amount: invoice.amount,
      dueAt: invoice.dueAt,
    }).then(
      () => true,
      () => false,
    );

    // The caller signed as the merchant, so they get the key for the invoice's pay link.
    return { id: String(id), txHash: hash, saved, linkKey: payLinkKey(id) };
  });
}
