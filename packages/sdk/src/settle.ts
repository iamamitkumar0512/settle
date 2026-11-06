import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { DEFAULTS, MULTICALL3_ADDRESS, registryAbi, USDT_DECIMALS, usdtAbi } from "./config";
import {
  authorizationNonce,
  CANCEL_TYPES,
  CREATE_TYPES,
  expiry,
  hashInvoiceDetails,
  parseCustomer,
  randomBytes32,
  RECEIVE_TYPES,
  refundNonce,
  registryDomain,
  splitSignature,
  transferNonce,
  usdtDomain,
} from "./signing";

export type SettleConfig = {
  /** Where Settle runs, for example https://settle.example. Signed requests go here, and pay links point here. */
  baseUrl: string;
  /** The wallet that signs. Reading invoices needs none. Keep its key on your server. */
  account?: LocalAccount;
  rpcUrl?: string;
  chainId?: number;
  registryAddress?: Address;
  transferAddress?: Address;
  usdtAddress?: Address;
};

export type InvoiceStatus = "open" | "paid" | "refunded" | "cancelled";

const STATUSES: InvoiceStatus[] = ["open", "paid", "refunded", "cancelled"];

/** Amounts are USDT in base units: 1 USDT is 1_000_000n. */
export type Invoice = {
  id: bigint;
  merchant: Address;
  /** Null until the invoice is paid. */
  payer: Address | null;
  amount: bigint;
  /** The total refunded so far. `status` is "refunded" once this is above 0. */
  refunded: bigint;
  dueAt: Date;
  paidAt: Date | null;
  status: InvoiceStatus;
  /** Kept back from the merchant to repay gas, when the invoice is paid without gas. */
  networkFee: bigint;
};

export type NewInvoice = {
  /** USDT as text ("12.50") or in base units (12_500_000n). */
  amount: string | bigint;
  dueAt: Date;
  /** The name your customer sees on the pay page. */
  businessName: string;
  /** Your customer's email or wallet address. It is how they find the invoice in Settle. */
  customer: string;
  customerName?: string;
  /** What the invoice is for. Shown on the pay page. */
  memo?: string;
};

export type CreatedInvoice = {
  id: bigint;
  /** Send your customer here to pay. */
  payUrl: string;
  /** The key at the end of `payUrl`. Its holder can open the invoice's PDF. */
  linkKey: string;
  txHash: Hash;
  /** False if the invoice exists on-chain but its details were not saved. */
  detailsSaved: boolean;
};

/** `code` is Settle's reason, such as "InvoiceNotOpen" or "open_invoice_limit". */
export class SettleError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
    this.name = "SettleError";
  }
}

export function parseUsdt(text: string) {
  const value = text.replaceAll(",", "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new SettleError("invalid_amount");
  return parseUnits(value, USDT_DECIMALS);
}

export function formatUsdt(amount: bigint) {
  return formatUnits(amount, USDT_DECIMALS);
}

function toAmount(value: string | bigint) {
  const amount = typeof value === "bigint" ? value : parseUsdt(value);
  if (amount <= 0n) throw new SettleError("invalid_amount");
  return amount;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type InvoiceRow = readonly [Address, Address, bigint, bigint, bigint, bigint, number, unknown, bigint];

function toInvoice(id: bigint, row: InvoiceRow): Invoice {
  const [merchant, payer, amount, refunded, dueAt, paidAt, status, , relayFee] = row;
  return {
    id,
    merchant,
    payer: payer === zeroAddress ? null : payer,
    amount,
    refunded,
    dueAt: new Date(Number(dueAt) * 1000),
    paidAt: paidAt === 0n ? null : new Date(Number(paidAt) * 1000),
    status: STATUSES[status] ?? "open",
    networkFee: relayFee,
  };
}

/**
 * A client for Settle. The wallet signs each request and Settle's relayer submits it, so the
 * wallet never needs gas. Invoices created here show up in the Settle dashboard for the same
 * wallet, because both read the same contract.
 */
export class Settle {
  readonly baseUrl: string;
  readonly chainId: number;
  readonly registryAddress: Address;
  readonly transferAddress: Address;
  readonly usdtAddress: Address;
  readonly #account?: LocalAccount;
  readonly #client: PublicClient;

  constructor(config: SettleConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.chainId = config.chainId ?? DEFAULTS.chainId;
    this.registryAddress = config.registryAddress ?? DEFAULTS.registryAddress;
    this.transferAddress = config.transferAddress ?? DEFAULTS.transferAddress;
    this.usdtAddress = config.usdtAddress ?? DEFAULTS.usdtAddress;
    this.#account = config.account;
    this.#client = createPublicClient({ transport: http(config.rpcUrl ?? DEFAULTS.rpcUrl) });
  }

  /** The signing wallet's address. */
  get address() {
    return this.#signer().address;
  }

  /** What Settle's relayer charges right now. Fees only repay gas. */
  async quote() {
    const quote = await this.#request("/api/relay/quote");
    return {
      available: quote.available === true,
      /** Stored on a new invoice, and taken from it when it is paid without gas. */
      invoiceFee: BigInt(String(quote.relayFee)),
      /** Taken from the amount of a transfer sent without gas. */
      transferFee: BigInt(String(quote.withdrawFee)),
      minInvoice: BigInt(String(quote.minInvoice)),
    };
  }

  /** Creates an invoice and returns the link your customer pays at. */
  async createInvoice(invoice: NewInvoice): Promise<CreatedInvoice> {
    const account = this.#signer();
    const customer = parseCustomer(invoice.customer);
    if (!customer) throw new SettleError("invalid_customer");

    const { invoiceFee } = await this.quote();
    const details = {
      merchantName: invoice.businessName,
      customerName: invoice.customerName ?? "",
      ...customer,
      memo: invoice.memo ?? "",
    };
    const detailsSalt = randomBytes32();
    const request = {
      merchant: account.address,
      amount: toAmount(invoice.amount),
      dueAt: BigInt(Math.floor(invoice.dueAt.getTime() / 1000)),
      ref: hashInvoiceDetails(details, detailsSalt),
      relayFee: invoiceFee,
      salt: randomBytes32(),
      deadline: expiry(),
    };
    const signature = await account.signTypedData({
      domain: registryDomain(this.chainId, this.registryAddress),
      types: CREATE_TYPES,
      primaryType: "CreateInvoice",
      message: request,
    });

    const created = await this.#request("/api/relay/create", {
      request,
      signature,
      details: { ...details, salt: detailsSalt },
    });
    const id = BigInt(String(created.id));
    const linkKey = String(created.linkKey ?? "");
    return {
      id,
      payUrl: this.payUrl(id, { linkKey }),
      linkKey,
      txHash: created.txHash as Hash,
      detailsSaved: created.saved === true,
    };
  }

  /**
   * The page a customer pays at. `returnPath` adds a button back to a page on the same site as
   * Settle once the invoice is paid.
   */
  payUrl(id: bigint, options: { linkKey?: string; returnPath?: string } = {}) {
    const query = options.returnPath ? `?return=${encodeURIComponent(options.returnPath)}` : "";
    const key = options.linkKey ? `#k=${options.linkKey}` : "";
    return `${this.baseUrl}/pay/${id}${query}${key}`;
  }

  /** Reads an invoice straight from the contract, so the answer doesn't depend on Settle. */
  async getInvoice(id: bigint): Promise<Invoice> {
    const row = await this.#client.readContract({
      address: this.registryAddress,
      abi: registryAbi,
      functionName: "invoices",
      args: [id],
    });
    if (row[0] === zeroAddress) throw new SettleError("InvoiceNotFound", 404);
    return toInvoice(id, row);
  }

  /** The business name and description saved with an invoice, or null if none were saved. */
  async getInvoiceDetails(id: bigint) {
    const response = await fetch(`${this.baseUrl}/api/invoices/${id}/details`);
    if (response.status === 404) return null;
    if (!response.ok) throw new SettleError("failed", response.status);
    const details = (await response.json()) as Record<string, unknown>;
    return {
      businessName: String(details.merchantName ?? ""),
      memo: String(details.memo ?? ""),
      hasPdf: details.hasPdf === true,
    };
  }

  /** Every invoice of a merchant, newest first. Defaults to the signing wallet. */
  async listInvoices(merchant: Address = this.address): Promise<Invoice[]> {
    const nextId = await this.#client.readContract({
      address: this.registryAddress,
      abi: registryAbi,
      functionName: "nextId",
    });
    const ids = Array.from({ length: Number(nextId) - 1 }, (_, index) => BigInt(index + 1));
    if (ids.length === 0) return [];

    const rows = await this.#client.multicall({
      multicallAddress: MULTICALL3_ADDRESS,
      allowFailure: false,
      contracts: ids.map(
        (id) =>
          ({
            address: this.registryAddress,
            abi: registryAbi,
            functionName: "invoices",
            args: [id],
          }) as const,
      ),
    });
    return rows
      .map((row, index) => toInvoice(ids[index], row))
      .filter((invoice) => invoice.merchant.toLowerCase() === merchant.toLowerCase())
      .reverse();
  }

  /** Resolves once the invoice is paid. Rejects if it is cancelled or the time runs out. */
  async waitForPayment(id: bigint, options: { timeoutMs?: number; pollMs?: number } = {}) {
    const { timeoutMs = 10 * 60_000, pollMs = 3_000 } = options;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const invoice = await this.getInvoice(id);
      if (invoice.status === "cancelled") throw new SettleError("InvoiceCancelled");
      if (invoice.status !== "open") return invoice;
      if (Date.now() + pollMs > deadline) throw new SettleError("timeout");
      await sleep(pollMs);
    }
  }

  /** Pays an invoice from the signing wallet, without gas. The wallet needs the USDT. */
  async pay(id: bigint) {
    const account = this.#signer();
    const invoice = await this.getInvoice(id);
    const authorization = {
      from: account.address,
      to: this.registryAddress,
      value: invoice.amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: authorizationNonce(id, account.address),
    };
    const signature = await this.#signUsdt(authorization);
    const paid = await this.#request("/api/relay/pay", {
      invoiceId: id,
      payer: account.address,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return { txHash: paid.txHash as Hash };
  }

  /** Sends USDT back to whoever paid the invoice, in part or in full. */
  async refund(id: bigint, amount: string | bigint) {
    const account = this.#signer();
    const invoice = await this.getInvoice(id);
    const value = toAmount(amount);
    const authorization = {
      from: account.address,
      to: this.registryAddress,
      value,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: refundNonce(id, invoice.refunded),
    };
    const signature = await this.#signUsdt(authorization);
    const refunded = await this.#request("/api/relay/refund", {
      invoiceId: id,
      amount: value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return { txHash: refunded.txHash as Hash };
  }

  /** Cancels an invoice that hasn't been paid. */
  async cancel(id: bigint) {
    const request = { id, deadline: expiry() };
    const signature = await this.#signer().signTypedData({
      domain: registryDomain(this.chainId, this.registryAddress),
      types: CANCEL_TYPES,
      primaryType: "CancelInvoice",
      message: request,
    });
    const cancelled = await this.#request("/api/relay/cancel", {
      invoiceId: id,
      deadline: request.deadline,
      signature,
    });
    return { txHash: cancelled.txHash as Hash };
  }

  /** Sends the wallet's USDT to any address without gas. The network fee comes out of `amount`. */
  async withdraw(to: Address, amount: string | bigint) {
    const account = this.#signer();
    if (!isAddress(to)) throw new SettleError("invalid_address");
    const value = toAmount(amount);
    const { transferFee: fee } = await this.quote();
    if (value <= fee) throw new SettleError("FeeTooLarge");

    const salt = randomBytes32();
    const authorization = {
      from: account.address,
      to: this.transferAddress,
      value,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: transferNonce(to, fee, salt),
    };
    const signature = await this.#signUsdt(authorization);
    const sent = await this.#request("/api/relay/withdraw", {
      from: account.address,
      to,
      amount: value,
      fee,
      salt,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      ...splitSignature(signature),
    });
    return { txHash: sent.txHash as Hash, fee, received: value - fee };
  }

  /** A wallet's USDT balance. Defaults to the signing wallet. */
  balance(address: Address = this.address) {
    return this.#client.readContract({
      address: this.usdtAddress,
      abi: usdtAbi,
      functionName: "balanceOf",
      args: [address],
    });
  }

  #signer() {
    if (!this.#account) throw new SettleError("account_required");
    return this.#account;
  }

  #signUsdt(message: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: `0x${string}`;
  }) {
    return this.#signer().signTypedData({
      domain: usdtDomain(this.chainId, this.usdtAddress),
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message,
    });
  }

  // Sends JSON to Settle. Numbers travel as text, because JSON has no big integers.
  async #request(path: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body, (_, value) =>
                typeof value === "bigint" ? String(value) : value,
              ),
      });
    } catch {
      throw new SettleError("network");
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new SettleError(typeof data.error === "string" ? data.error : "failed", response.status);
    }
    return data;
  }
}
