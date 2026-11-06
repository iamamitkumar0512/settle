import type { Address, Hex } from "viem";
import { Client, SettleError, toBaseUnits, toDecimal } from "./client";
import { agentSaleNonce, expiry } from "./signing";

export type AgentCharge = {
  /** In USDT, like "4.50". */
  amount: string | number;
  /** What the agent is buying. */
  description?: string;
  /**
   * Your own order number. Build it from an id the agent sends, so a retry of the same request
   * is the same order and is never charged twice.
   */
  receipt: string;
  /** How long the agent has to pay. */
  timeoutSeconds?: number;
};

/** The agent has paid. Every field is plain text. */
export type AgentSale = {
  paid: true;
  /** True when this order was already paid, and this request is a retry. Don't ship it twice. */
  repeat: boolean;
  receipt: string;
  description: string;
  amount: string;
  currency: "USDT";
  /** Kept back from you to repay gas. */
  networkFee: string;
  /** What reached you after the network fee. */
  received: string;
  /** The agent's address. */
  payer: string;
  paymentId: string;
  /** The payment on the block explorer. */
  proofUrl: string;
  /** Your answer to the agent, with the payment header x402 clients read. */
  respond(body: unknown, init?: ResponseInit): Response;
};

/** Nothing has been paid yet. Return `response` to the agent as it is. */
export type AgentPaymentDue = { paid: false; response: Response };

export type AgentChargeResult = AgentSale | AgentPaymentDue;

type SavedSale = {
  receipt: string;
  description: string;
  payer: string;
  amount: string;
  networkFee: string;
  received: string;
  transaction: string;
};

const DEFAULT_TIMEOUT_SECONDS = 120;
const EXPLORER = "https://explorer.testnet.whitechain.io";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

function decode(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, "base64").toString("utf8"));
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Not a payment problem, so the agent should try the same request again.
function tryAgain(status: number, error: string, seconds: number) {
  return Response.json(
    { error },
    { status, headers: { "Retry-After": String(seconds) } },
  );
}

/** Sell to AI agents over x402. They need no account, no key and no gas. */
export class Agents {
  readonly #client: Client;

  /** @internal */
  constructor(client: Client) {
    this.#client = client;
  }

  /**
   * Puts a price on a request. Call it from a route: with no payment it answers 402 and the
   * price, and with a payment it settles it and hands you the sale.
   */
  async charge(request: Request, input: AgentCharge): Promise<AgentChargeResult> {
    const client = this.#client;
    const amount = toBaseUnits(input.amount);
    const { receipt, description = "" } = input;
    if (typeof receipt !== "string" || !/^[\w.:#/-]{1,64}$/.test(receipt)) {
      throw new SettleError("invalid_receipt");
    }
    const merchantName = client.businessName;
    if (!merchantName) throw new SettleError("business_name_required");

    const offer = {
      scheme: "exact",
      network: `eip155:${client.chainId}`,
      amount: String(amount),
      asset: client.usdtAddress,
      payTo: client.account.address,
      maxTimeoutSeconds: input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS,
      extra: { name: "Tether USD", version: "1" },
    };
    const paymentRequired = (error = "payment_required") => {
      const resource = { url: request.url, description, mimeType: "application/json" };
      return {
        paid: false as const,
        response: Response.json(
          { error, amount: toDecimal(amount), currency: "USDT" },
          {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": encode({ x402Version: 2, error, resource, accepts: [offer] }),
            },
          },
        ),
      };
    };
    const due = (status: number, error: string, seconds = 10) => ({
      paid: false as const,
      response: tryAgain(status, error, seconds),
    });

    let settled: Record<string, unknown>;
    try {
      // First, always: this is what makes a retry of a paid order free.
      const known = await client.request("/api/merchant/agent-sales", {
        credentials: await client.credentials(),
        receipt,
      });
      if (known.state === "paid") {
        const sale = known.sale as SavedSale;
        // The same order number for something else is a mistake, not a retry.
        if (sale.amount !== String(amount) || sale.description !== description) {
          return due(409, "receipt_already_used", 0);
        }
        return this.#sale(sale, true);
      }
      if (known.state === "in_progress") return due(409, "payment_in_progress");

      const header = request.headers.get("payment-signature");
      if (!header) return paymentRequired();
      const payment = decode(header);
      const authorization = (payment?.payload as { authorization?: { nonce?: unknown } } | undefined)
        ?.authorization;
      if (!payment || typeof authorization?.nonce !== "string") {
        return paymentRequired("invalid_exact_evm_payload");
      }

      const { agentFee, relayer } = await client.quote();
      const validBefore = expiry();
      const repayment = await client.signUsdtTransfer({
        from: client.account.address,
        to: relayer as Address,
        value: agentFee,
        validAfter: 0n,
        validBefore,
        nonce: agentSaleNonce(authorization.nonce as Hex, { merchantName, receipt, description }),
      });
      settled = await client.request("/api/x402/settle", {
        x402Version: 2,
        paymentPayload: payment,
        paymentRequirements: offer,
        sale: { merchantName, receipt, description },
        repayment: { value: agentFee, validBefore, signature: repayment },
      });
    } catch (error) {
      if (!(error instanceof SettleError)) throw error;
      if (error.code === "invalid_receipt") throw error;
      // A refused payment moved nothing, and the agent is told why with the price again.
      if (error.status === 400) return paymentRequired(error.code);
      if (error.status === 409) return due(409, error.code);
      if (error.status === 429) return due(429, error.code, 60);
      // The payment may or may not have gone through, so the same request must be repeated.
      return due(503, "try_again");
    }

    const { sale, repeat } = settled.extra as { sale: SavedSale; repeat: boolean };
    return this.#sale(sale, repeat);
  }

  #sale(sale: SavedSale, repeat: boolean): AgentSale {
    const paymentId = sale.transaction;
    const header = encode({
      success: true,
      transaction: paymentId,
      network: `eip155:${this.#client.chainId}`,
      payer: sale.payer,
    });
    return {
      paid: true,
      repeat,
      receipt: sale.receipt,
      description: sale.description,
      amount: toDecimal(BigInt(sale.amount)),
      currency: "USDT",
      networkFee: toDecimal(BigInt(sale.networkFee)),
      received: toDecimal(BigInt(sale.received)),
      payer: sale.payer,
      paymentId,
      proofUrl: `${EXPLORER}/tx/${paymentId}`,
      respond: (body, init) => {
        const headers = new Headers(init?.headers);
        headers.set("PAYMENT-RESPONSE", header);
        return Response.json(body, { ...init, headers });
      },
    };
  }
}
