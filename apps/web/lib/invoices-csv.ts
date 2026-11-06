import { formatUnits, zeroAddress, type Address, type Hash, type PublicClient } from "viem";
import { registry, USDT_DECIMALS } from "./contracts";
import { explorerTxUrl } from "./format";
import { invoiceState, type Invoice } from "./invoice";
import type { InvoiceCustomer } from "./customer-invoices";
import { blockWindows, toEvent, type InvoiceEvent } from "./use-invoice-records";

const HEADERS = [
  "invoice_id",
  "business_name",
  "customer_name",
  "customer_email",
  "customer_wallet",
  "description",
  "order_reference",
  "status",
  "created_at_utc",
  "due_at_utc",
  "paid_at_utc",
  "currency",
  "amount",
  "refunded",
  "network_fee",
  "net_received",
  "payer",
  "merchant",
  "payment_tx",
  "payment_tx_url",
  "refund_txs",
  "cancel_tx",
];

type MerchantEvents = {
  created: Map<bigint, InvoiceEvent>;
  paid: Map<bigint, { hash: Hash; fee: bigint }>;
  refunds: Map<bigint, Hash[]>;
  cancelled: Map<bigint, Hash>;
};

// Reads this merchant's events in one pass, using the indexed merchant field.
async function readMerchantEvents(
  client: PublicClient,
  merchant: Address,
): Promise<MerchantEvents> {
  const latest = await client.getBlockNumber();
  const contract = { address: registry.address, abi: registry.abi };
  const events: MerchantEvents = {
    created: new Map(),
    paid: new Map(),
    refunds: new Map(),
    cancelled: new Map(),
  };

  for (const blocks of blockWindows(latest)) {
    const window = { args: { merchant }, ...blocks };
    const [created, paid, refunded, cancelled] = await Promise.all([
      client.getContractEvents({ ...contract, eventName: "InvoiceCreated", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoicePaid", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoiceRefunded", ...window }),
      client.getContractEvents({ ...contract, eventName: "InvoiceCancelled", ...window }),
    ]);

    for (const log of created) {
      events.created.set(log.args.id as bigint, await toEvent(client, log));
    }
    for (const log of paid) {
      events.paid.set(log.args.id as bigint, {
        hash: log.transactionHash,
        fee: log.args.relayFee ?? 0n,
      });
    }
    for (const log of cancelled) {
      events.cancelled.set(log.args.id as bigint, log.transactionHash);
    }
    for (const log of refunded) {
      const id = log.args.id as bigint;
      events.refunds.set(id, [...(events.refunds.get(id) ?? []), log.transactionHash]);
    }
  }

  return events;
}

// Spreadsheets read this form as a date. The headers say it is UTC.
function utc(time: Date) {
  return time.toISOString().slice(0, 19).replace("T", " ");
}

function utcSeconds(seconds: bigint) {
  return utc(new Date(Number(seconds) * 1000));
}

function usdt(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, USDT_DECIMALS).split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

// Quotes when needed, and stops a spreadsheet treating a value as a formula.
function cell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export async function buildInvoicesCsv(
  client: PublicClient,
  merchant: Address,
  invoices: Invoice[],
  now: bigint,
  customers: Map<string, InvoiceCustomer>,
) {
  const events = await readMerchantEvents(client, merchant);

  const rows = [...invoices].reverse().map((invoice) => {
    const isPaid = invoice.payer !== zeroAddress;
    const created = events.created.get(invoice.id);
    const payment = events.paid.get(invoice.id);
    const paymentTx = payment?.hash ?? "";
    // The gas repaid to the relayer. It is 0 when the customer paid their own gas.
    const fee = payment?.fee ?? 0n;
    const customer = customers.get(String(invoice.id));
    return [
      String(invoice.id),
      customer?.merchantName ?? "",
      customer?.customerName ?? "",
      customer?.customerEmail ?? "",
      customer?.customerWallet ?? "",
      customer?.memo ?? "",
      customer?.receipt ?? "",
      invoiceState(invoice, now, customer?.isOrder).label,
      created ? utc(created.time) : "",
      utcSeconds(invoice.dueAt),
      isPaid ? utcSeconds(invoice.paidAt) : "",
      "USDT",
      usdt(invoice.amount),
      usdt(invoice.refunded),
      usdt(fee),
      usdt(isPaid ? invoice.amount - invoice.refunded - fee : 0n),
      isPaid ? invoice.payer : "",
      invoice.merchant,
      paymentTx,
      paymentTx && explorerTxUrl(paymentTx),
      (events.refunds.get(invoice.id) ?? []).join(" "),
      events.cancelled.get(invoice.id) ?? "",
    ];
  });

  return [HEADERS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
