import {
  getAddress,
  isAddress,
  isHash,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { Client, SettleError, toBaseUnits, toDecimal, toOrderId } from "./client";
import { MULTICALL3_ADDRESS, registryAbi, usdtAbi } from "./config";
import {
  authorizationNonce,
  CANCEL_TYPES,
  CREATE_TYPES,
  expiry,
  hashInvoiceDetails,
  parseCustomer,
  randomBytes32,
  refundNonce,
  registryDomain,
  splitSignature,
  transferNonce,
} from "./signing";

export type OrderStatus = "open" | "paid" | "refunded" | "cancelled";

const STATUSES: OrderStatus[] = ["open", "paid", "refunded", "cancelled"];

// An order sits unpaid on-chain until someone pays it, so it needs a date it is due by.
const ORDER_DUE_MS = 24 * 60 * 60 * 1000;
const LINK_DUE_MS = 7 * 24 * 60 * 60 * 1000;

/** Every field is plain text, so an order can go straight into a JSON response. */
export type Order = {
  id: string;
  /** In USDT, like "3.00". */
  amount: string;
  currency: "USDT";
  status: OrderStatus;
  description: string;
  /** Your own order number. Only you can read it. */
  receipt: string;
  /** The email or wallet address it was sent to, if you named one. */
  customer: string | null;
  /** Send your customer here if you aren't using checkout.js. */
  payUrl: string;
  /** Null until it is paid. */
  payer: string | null;
  /** The total refunded so far. */
  refunded: string;
  /** Kept back from you to repay gas, when the customer pays without gas. */
  networkFee: string;
  dueAt: string;
  paidAt: string | null;
};

export type NewOrder = {
  /** In USDT, like "3.00". */
  amount: string | number;
  /** What is being bought. Shown at checkout. */
  description?: string;
  /** Your own order number. Up to 64 plain characters. */
  receipt?: string;
  /** Where your customer goes after paying if checkout can't return to your page. */
  callbackUrl?: string;
  /** An email or wallet address. Leave it out and whoever checks out pays. */
  customer?: string;
  customerName?: string;
  /** Overrides the name passed to new Settle(). */
  businessName?: string;
};

export type NewPaymentLink = Omit<NewOrder, "callbackUrl"> & {
  /** Defaults to 7 days from now. */
  dueAt?: Date;
};

export type PaymentLink = Pick<Order, "id" | "amount" | "currency" | "description" | "customer"> & {
  /** Share this with your customer. */
  url: string;
  dueAt: string;
};

/** What checkout.js hands your page, and what orders.pay() returns. */
export type CheckoutResponse = {
  settle_order_id: string;
  settle_payment_id: string;
};

export type Payment = {
  /** The Whitechain transaction that paid the order. */
  id: string;
  orderId: string;
  /** What the customer paid. */
  amount: string;
  /** What reached you after the network fee. */
  received: string;
  networkFee: string;
  refunded: string;
  currency: "USDT";
  status: "paid" | "refunded";
  /** Your own order number. */
  receipt: string;
  description: string;
  payer: string;
  paidAt: string;
  /** Your customer's receipt on Settle, with the proof on Whitechain and any refunds. */
  receiptUrl: string;
};

type Row = readonly [Address, Address, bigint, bigint, bigint, bigint, number, unknown, bigint];

type Saved = {
  memo?: string;
  receipt?: string;
  customerEmail?: string;
  customerWallet?: string;
  linkKey?: string;
};

function isoDate(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString();
}

function toOrder(client: Client, id: bigint, row: Row, saved: Saved = {}): Order {
  const [, payer, amount, refunded, dueAt, paidAt, status, , relayFee] = row;
  return {
    id: String(id),
    amount: toDecimal(amount),
    currency: "USDT",
    status: STATUSES[status] ?? "open",
    description: saved.memo ?? "",
    receipt: saved.receipt ?? "",
    customer: saved.customerEmail || saved.customerWallet || null,
    payUrl: payUrl(client, id, saved.linkKey),
    payer: payer === zeroAddress ? null : payer,
    refunded: toDecimal(refunded),
    networkFee: toDecimal(relayFee),
    dueAt: isoDate(dueAt),
    paidAt: paidAt === 0n ? null : isoDate(paidAt),
  };
}

function payUrl(client: Client, id: bigint, linkKey?: string) {
  return `${client.baseUrl}/pay/${id}${linkKey ? `#k=${linkKey}` : ""}`;
}

function readRow(client: Client, id: bigint): Promise<Row> {
  return client.chain.readContract({
    address: client.registryAddress,
    abi: registryAbi,
    functionName: "invoices",
    args: [id],
  });
}

// Reads an order of any merchant. It has no merchant only if it doesn't exist.
async function readAnyOrder(client: Client, id: bigint) {
  const row = await readRow(client, id);
  if (row[0] === zeroAddress) throw new SettleError("InvoiceNotFound", 404);
  return row;
}

async function readOwnOrder(client: Client, id: bigint) {
  const row = await readAnyOrder(client, id);
  if (row[0] !== client.account.address) throw new SettleError("not_your_order", 403);
  return row;
}

// An order's private fields. They add detail, so Settle being unreachable doesn't lose the order.
async function readSaved(client: Client, id?: bigint): Promise<Map<string, Saved>> {
  try {
    const credentials = await client.credentials();
    const { customers } = await client.request("/api/merchant/customers", { credentials, id });
    return new Map((customers as (Saved & { id: string })[]).map((row) => [row.id, row]));
  } catch {
    return new Map();
  }
}

function isCallbackUrl(text: string) {
  try {
    const url = new URL(text);
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (url.protocol === "http:" && isLocal);
  } catch {
    return false;
  }
}

async function createInvoice(client: Client, input: NewOrder, dueAt: Date) {
  const businessName = input.businessName ?? client.businessName;
  if (!businessName?.trim()) throw new SettleError("business_name_required");

  const customer = input.customer
    ? parseCustomer(input.customer)
    : { customerEmail: "", customerWallet: "" };
  if (!customer) throw new SettleError("invalid_customer");
  const { receipt, callbackUrl } = input;
  if (receipt !== undefined && !/^[\x20-\x7e]{1,64}$/.test(receipt)) {
    throw new SettleError("invalid_receipt");
  }
  if (callbackUrl !== undefined && !isCallbackUrl(callbackUrl)) {
    throw new SettleError("invalid_callback_url");
  }

  const amount = toBaseUnits(input.amount);
  const { relayFee } = await client.quote();
  const details = {
    merchantName: businessName,
    customerName: input.customerName ?? "",
    ...customer,
    memo: input.description ?? "",
    ...(receipt ? { receipt } : {}),
    ...(callbackUrl ? { callbackUrl } : {}),
  };
  const detailsSalt = randomBytes32();
  const request = {
    merchant: client.account.address,
    amount,
    dueAt: BigInt(Math.floor(dueAt.getTime() / 1000)),
    ref: hashInvoiceDetails(details, detailsSalt),
    relayFee,
    salt: randomBytes32(),
    deadline: expiry(),
  };
  const signature = await client.account.signTypedData({
    domain: registryDomain(client.chainId, client.registryAddress),
    types: CREATE_TYPES,
    primaryType: "CreateInvoice",
    message: request,
  });

  const payload = { ...details, salt: detailsSalt };
  const created = await client.request("/api/relay/create", {
    request,
    signature,
    details: payload,
  });
  const id = BigInt(String(created.id));
  // The order exists on-chain either way. Its details are worth one more try.
  if (created.saved !== true) {
    await client.request(`/api/invoices/${id}/details`, payload).catch(() => undefined);
  }
  return {
    id,
    linkKey: String(created.linkKey ?? ""),
    amount,
    relayFee,
    details,
    dueAt: request.dueAt,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Orders {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  /** Creates an order on your server. Hand its id to checkout.js in the browser. */
  async create(input: NewOrder): Promise<Order> {
    const dueAt = new Date(Date.now() + ORDER_DUE_MS);
    const created = await createInvoice(this.#client, input, dueAt);
    return {
      id: String(created.id),
      amount: toDecimal(created.amount),
      currency: "USDT",
      status: "open",
      description: created.details.memo,
      receipt: input.receipt ?? "",
      customer: created.details.customerEmail || created.details.customerWallet || null,
      payUrl: payUrl(this.#client, created.id, created.linkKey),
      payer: null,
      refunded: "0.00",
      networkFee: toDecimal(created.relayFee),
      dueAt: isoDate(created.dueAt),
      paidAt: null,
    };
  }

  /** One of your orders, read from the chain. */
  async fetch(id: string | number | bigint): Promise<Order> {
    const orderId = toOrderId(id);
    const row = await readOwnOrder(this.#client, orderId);
    const saved = await readSaved(this.#client, orderId);
    return toOrder(this.#client, orderId, row, saved.get(String(orderId)));
  }

  /** All your orders and payment links, newest first. */
  async all(): Promise<Order[]> {
    const client = this.#client;
    const nextId = await client.chain.readContract({
      address: client.registryAddress,
      abi: registryAbi,
      functionName: "nextId",
    });
    const ids = Array.from({ length: Number(nextId) - 1 }, (_, index) => BigInt(index + 1));
    if (ids.length === 0) return [];

    const rows = await client.chain.multicall({
      multicallAddress: MULTICALL3_ADDRESS,
      allowFailure: false,
      contracts: ids.map(
        (id) =>
          ({
            address: client.registryAddress,
            abi: registryAbi,
            functionName: "invoices",
            args: [id],
          }) as const,
      ),
    });
    const saved = await readSaved(client);
    return rows
      .map((row, index) => ({ row, id: ids[index] }))
      .filter(({ row }) => row[0] === client.account.address)
      .map(({ row, id }) => toOrder(client, id, row, saved.get(String(id))))
      .reverse();
  }

  /** Cancels an order nobody has paid. */
  async cancel(id: string | number | bigint) {
    const client = this.#client;
    const orderId = toOrderId(id);
    await readOwnOrder(client, orderId);
    const request = { id: orderId, deadline: expiry() };
    const signature = await client.account.signTypedData({
      domain: registryDomain(client.chainId, client.registryAddress),
      types: CANCEL_TYPES,
      primaryType: "CancelInvoice",
      message: request,
    });
    const cancelled = await client.request("/api/relay/cancel", {
      invoiceId: orderId,
      deadline: request.deadline,
      signature,
    });
    return { txHash: cancelled.txHash as string };
  }

  /** Resolves once your order is paid. For scripts: a store should use a webhook. */
  async waitForPayment(
    id: string | number | bigint,
    options: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<Order> {
    const { timeoutMs = 10 * 60_000, pollMs = 3_000 } = options;
    const orderId = toOrderId(id);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const row = await readOwnOrder(this.#client, orderId);
      const status = STATUSES[row[6]];
      if (status === "cancelled") throw new SettleError("order_cancelled");
      if (status !== "open") return this.fetch(orderId);
      if (Date.now() + pollMs > deadline) throw new SettleError("timeout");
      await sleep(pollMs);
    }
  }

  /** Pays any open order from this account, without gas. For a script or an agent. */
  async pay(id: string | number | bigint): Promise<CheckoutResponse> {
    const client = this.#client;
    const orderId = toOrderId(id);
    const [, , amount] = await readAnyOrder(client, orderId);
    const payer = client.account.address;
    const authorization = {
      from: payer,
      to: client.registryAddress,
      value: amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: authorizationNonce(orderId, payer),
    };
    const signature = await client.signUsdt(authorization);
    const paid = await client.request("/api/relay/pay", {
      invoiceId: orderId,
      payer,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return { settle_order_id: String(orderId), settle_payment_id: paid.txHash as string };
  }
}

export class Payments {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  /**
   * Confirms what the browser sent after checkout. Run it on your server before fulfilling. It
   * reads Whitechain, not Settle: the payment must exist, must have paid this order, and the
   * order must be yours. Also check that the order is the one this customer is buying.
   */
  async verify(response: CheckoutResponse): Promise<Payment> {
    const client = this.#client;
    const orderId = toOrderId(response?.settle_order_id);
    const paymentId = response?.settle_payment_id;
    if (typeof paymentId !== "string" || !isHash(paymentId)) {
      throw new SettleError("invalid_payment_id");
    }

    const row = await readOwnOrder(client, orderId);
    const order = toOrder(client, orderId, row);
    if (order.status !== "paid" && order.status !== "refunded") {
      throw new SettleError("order_not_paid");
    }

    const receipt = await client.chain
      .getTransactionReceipt({ hash: paymentId as Hash })
      .catch(() => null);
    if (!receipt || receipt.status !== "success") throw new SettleError("payment_not_found");
    const [paid] = parseEventLogs({
      abi: registryAbi,
      eventName: "InvoicePaid",
      logs: receipt.logs.filter(
        ({ address }) => address.toLowerCase() === client.registryAddress.toLowerCase(),
      ),
    }).filter((log) => log.args.id === orderId);
    if (!paid) throw new SettleError("payment_mismatch");

    const saved = (await readSaved(client, orderId)).get(String(orderId));
    const { amount, relayFee, payer } = paid.args;
    return {
      id: paymentId,
      orderId: order.id,
      amount: toDecimal(amount),
      received: toDecimal(amount - relayFee),
      networkFee: toDecimal(relayFee),
      refunded: order.refunded,
      currency: "USDT",
      status: order.status,
      receipt: saved?.receipt ?? "",
      description: saved?.memo ?? "",
      payer,
      paidAt: order.paidAt as string,
      receiptUrl: `${client.baseUrl}/pay/${orderId}/receipt`,
    };
  }
}

export class Refunds {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  /** Sends USDT back to whoever paid. Without `amount`, refunds all that remains. */
  async create(input: { orderId: string | number | bigint; amount?: string | number }) {
    const client = this.#client;
    const orderId = toOrderId(input.orderId);
    const [, , paid, refunded] = await readOwnOrder(client, orderId);
    const value = input.amount === undefined ? paid - refunded : toBaseUnits(input.amount);
    if (value <= 0n) throw new SettleError("RefundTooLarge");

    const authorization = {
      from: client.account.address,
      to: client.registryAddress,
      value,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: refundNonce(orderId, refunded),
    };
    const signature = await client.signUsdt(authorization);
    const sent = await client.request("/api/relay/refund", {
      invoiceId: orderId,
      amount: value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return {
      id: sent.txHash as string,
      orderId: String(orderId),
      amount: toDecimal(value),
      currency: "USDT" as const,
    };
  }
}

export class PaymentLinks {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  /** An invoice with a due date and a link to share. No code is needed on your site. */
  async create(input: NewPaymentLink): Promise<PaymentLink> {
    const dueAt = input.dueAt ?? new Date(Date.now() + LINK_DUE_MS);
    const created = await createInvoice(this.#client, input, dueAt);
    return {
      id: String(created.id),
      url: payUrl(this.#client, created.id, created.linkKey),
      amount: toDecimal(created.amount),
      currency: "USDT",
      description: created.details.memo,
      customer: created.details.customerEmail || created.details.customerWallet || null,
      dueAt: isoDate(created.dueAt),
    };
  }
}

export class Account {
  readonly #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  /** This account's USDT balance. */
  async balance() {
    const client = this.#client;
    const balance = await client.chain.readContract({
      address: client.usdtAddress,
      abi: usdtAbi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    return { amount: toDecimal(balance), currency: "USDT" as const };
  }

  /** Sends USDT to any address, without gas. The network fee comes out of `amount`. */
  async withdraw(input: { to: string; amount: string | number }) {
    const client = this.#client;
    if (!isAddress(input.to, { strict: false })) throw new SettleError("invalid_address");
    const to = getAddress(input.to);
    const value = toBaseUnits(input.amount);
    const { withdrawFee: fee } = await client.quote();
    if (value <= fee) throw new SettleError("FeeTooLarge");

    const salt = randomBytes32();
    const authorization = {
      from: client.account.address,
      to: client.transferAddress,
      value,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: transferNonce(to, fee, salt),
    };
    const signature = await client.signUsdt(authorization);
    const sent = await client.request("/api/relay/withdraw", {
      from: client.account.address,
      to,
      amount: value,
      fee,
      salt,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return {
      txHash: sent.txHash as string,
      to,
      amount: toDecimal(value),
      fee: toDecimal(fee),
      received: toDecimal(value - fee),
    };
  }
}
