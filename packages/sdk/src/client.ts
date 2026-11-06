import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULTS, USDT_DECIMALS } from "./config";
import { RECEIVE_TYPES, usdtDomain } from "./signing";

export type SettleOptions = {
  /** From Settle, under Developers. It is your account's address. */
  keyId: string;
  /** From Settle, under Developers. Keep it on your server. */
  keySecret: string;
  /** The name your customer sees at checkout. */
  businessName?: string;
  /** Where Settle runs. Or set SETTLE_BASE_URL. */
  baseUrl?: string;
  rpcUrl?: string;
  chainId?: number;
  registryAddress?: Address;
  transferAddress?: Address;
  usdtAddress?: Address;
};

const MESSAGES: Record<string, string> = {
  server_only: "Settle's Node SDK runs on your server. Your key secret must never reach a browser.",
  invalid_key_id: "keyId must be the Key ID from your Settle Developers page.",
  invalid_key_secret: "keySecret must be the Key Secret from your Settle Developers page.",
  key_mismatch: "keyId and keySecret belong to different accounts.",
  base_url_required: "Pass baseUrl or set SETTLE_BASE_URL: the address of your Settle.",
  business_name_required: "Pass businessName to new Settle(), or to this call.",
  invalid_amount: "amount must be a positive USDT value with at most 6 decimals, like \"3.00\".",
  invalid_order_id: "That isn't a valid order id.",
  invalid_payment_id: "That isn't a valid payment id.",
  invalid_customer: "customer must be an email or a wallet address.",
  invalid_receipt: "receipt must be 1 to 64 plain characters.",
  invalid_callback_url: "callbackUrl must be https, or http on localhost.",
  invalid_address: "That isn't a valid address.",
  not_your_order: "This order belongs to another Settle account.",
  order_not_paid: "This order hasn't been paid.",
  payment_not_found: "No successful payment has that id.",
  payment_mismatch: "That payment didn't pay this order.",
  order_cancelled: "This order was cancelled.",
  timeout: "The order wasn't paid in time.",
  network: "Couldn't reach Settle.",
  InvoiceNotFound: "That order doesn't exist.",
  InvoiceNotOpen: "This order was already paid or cancelled.",
  NotRefundable: "This order hasn't been paid, so there's nothing to refund.",
  RefundTooLarge: "That's more than can still be refunded.",
  FeeTooLarge: "That amount doesn't cover the network fee.",
  invoice_too_small: "That's below the smallest amount Settle accepts. See settle.fees().",
  open_invoice_limit: "An account that has never been paid can hold 5 unpaid orders at a time.",
  daily_limit_reached: "You've reached today's limit for this action.",
  too_many_requests: "Too many requests. Wait a minute and try again.",
  log_in_again: "Settle refused this key. Check keyId and keySecret.",
  "ERC20: transfer amount exceeds balance": "This account doesn't have enough USDT.",
};

/** `code` is the reason, such as "order_not_paid" or "RefundTooLarge". */
export class SettleError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(MESSAGES[code] ?? code);
    this.name = "SettleError";
  }
}

/** Amounts go in as USDT, like "3.00", and never as a float with rounding noise. */
export function toBaseUnits(value: string | number) {
  const text = String(value).replaceAll(",", "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new SettleError("invalid_amount");
  const amount = parseUnits(text, USDT_DECIMALS);
  if (amount <= 0n) throw new SettleError("invalid_amount");
  return amount;
}

// Amounts come back as text, so a result can go straight into res.json().
export function toDecimal(amount: bigint) {
  const [whole, fraction = ""] = formatUnits(amount, USDT_DECIMALS).split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

export function toOrderId(id: string | number | bigint) {
  const text = String(id);
  if (!/^[1-9]\d{0,18}$/.test(text)) throw new SettleError("invalid_order_id");
  return BigInt(text);
}

function toAccount(options: SettleOptions) {
  const { keyId, keySecret } = options;
  if (typeof keyId !== "string" || !isAddress(keyId, { strict: false })) {
    throw new SettleError("invalid_key_id");
  }
  const secret = typeof keySecret === "string" ? keySecret.trim() : "";
  const hex = secret.startsWith("0x") ? secret : `0x${secret}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new SettleError("invalid_key_secret");

  const account = privateKeyToAccount(hex as Hex);
  if (account.address !== getAddress(keyId)) throw new SettleError("key_mismatch");
  return account;
}

const SESSION_MS = 60 * 60 * 1000;

// Lets a test deployment be set outside the store's code. A real store needs none but the first.
function fromEnvironment() {
  const env = typeof process === "undefined" ? {} : process.env;
  return {
    baseUrl: env.SETTLE_BASE_URL,
    rpcUrl: env.SETTLE_RPC_URL,
    registryAddress: env.SETTLE_REGISTRY_ADDRESS as Address | undefined,
    transferAddress: env.SETTLE_TRANSFER_ADDRESS as Address | undefined,
  };
}

// What every part of the SDK shares: the account, the chain and the connection to Settle.
export class Client {
  readonly baseUrl: string;
  readonly businessName?: string;
  readonly chainId: number;
  readonly registryAddress: Address;
  readonly transferAddress: Address;
  readonly usdtAddress: Address;
  readonly account: LocalAccount;
  readonly chain: PublicClient;
  #session?: { credentials: { message: string; signature: Hex }; expiresAt: number };

  constructor(options: SettleOptions) {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      throw new SettleError("server_only");
    }
    this.account = toAccount(options);
    const env = fromEnvironment();
    this.baseUrl = (options.baseUrl ?? env.baseUrl ?? DEFAULTS.baseUrl).replace(/\/+$/, "");
    if (!this.baseUrl) throw new SettleError("base_url_required");
    this.businessName = options.businessName;
    this.chainId = options.chainId ?? DEFAULTS.chainId;
    this.registryAddress =
      options.registryAddress ?? env.registryAddress ?? DEFAULTS.registryAddress;
    this.transferAddress =
      options.transferAddress ?? env.transferAddress ?? DEFAULTS.transferAddress;
    this.usdtAddress = options.usdtAddress ?? DEFAULTS.usdtAddress;
    this.chain = createPublicClient({
      transport: http(options.rpcUrl ?? env.rpcUrl ?? DEFAULTS.rpcUrl),
    });
  }

  // What Settle's relayer charges right now. Fees only repay gas.
  async quote() {
    const quote = await this.request("/api/relay/quote");
    return {
      available: quote.available === true,
      relayFee: BigInt(String(quote.relayFee)),
      withdrawFee: BigInt(String(quote.withdrawFee)),
      minInvoice: BigInt(String(quote.minInvoice)),
    };
  }

  signUsdt(message: {
    from: Address;
    to: Address;
    value: bigint;
    validAfter: bigint;
    validBefore: bigint;
    nonce: Hex;
  }) {
    return this.account.signTypedData({
      domain: usdtDomain(this.chainId, this.usdtAddress),
      types: RECEIVE_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message,
    });
  }

  // Proves this account to Settle, which keeps an order's private fields for its merchant only.
  async credentials() {
    const now = Date.now();
    if (this.#session && this.#session.expiresAt > now + 60_000) return this.#session.credentials;

    const expiresAt = now + SESSION_MS;
    const message = [
      "Sign in to Settle.",
      "",
      `Wallet: ${this.account.address}`,
      `Site: ${new URL(this.baseUrl).host}`,
      `Expires: ${new Date(expiresAt).toISOString()}`,
    ].join("\n");
    const signature = await this.account.signMessage({ message });
    this.#session = { credentials: { message, signature }, expiresAt };
    return this.#session.credentials;
  }

  // Sends JSON to Settle. Numbers travel as text, because JSON has no big integers.
  async request(path: string, body?: unknown) {
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
