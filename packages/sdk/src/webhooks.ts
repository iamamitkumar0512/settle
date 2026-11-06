import { createHmac, timingSafeEqual } from "node:crypto";
import { SettleError } from "./client";

type EventBase = {
  /** The same event can arrive more than once. Use this to act on it only once. */
  id: string;
  created: string;
};

type OrderFields = {
  orderId: string;
  amount: string;
  currency: "USDT";
  /** Your own order number. */
  receipt: string;
  description: string;
  payer: string;
  receiptUrl: string;
};

export type OrderPaidEvent = EventBase & {
  type: "order.paid";
  data: OrderFields & {
    paymentId: string;
    /** What reached you after the network fee. */
    received: string;
    networkFee: string;
  };
};

export type RefundCreatedEvent = EventBase & {
  type: "refund.created";
  data: OrderFields & {
    refundId: string;
    /** All that has been refunded on this order so far. */
    totalRefunded: string;
  };
};

export type WebhookTestEvent = EventBase & {
  type: "webhook.test";
  data: { message: string };
};

export type WebhookEvent = OrderPaidEvent | RefundCreatedEvent | WebhookTestEvent;

export class Webhooks {
  /**
   * Checks a webhook really came from Settle and returns its event. Pass the body exactly as it
   * arrived, because the signature covers those bytes: read it as text or a Buffer, before any
   * JSON parsing.
   */
  verify(
    rawBody: string | Uint8Array,
    signature: string | null | undefined,
    secret: string | undefined,
  ): WebhookEvent {
    if (typeof signature !== "string" || !secret) {
      throw new SettleError("invalid_webhook_signature");
    }
    const body = Buffer.from(rawBody as string);
    const expected = createHmac("sha256", secret).update(body).digest();
    const given = Buffer.from(signature, "hex");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new SettleError("invalid_webhook_signature");
    }
    return JSON.parse(body.toString("utf8")) as WebhookEvent;
  }
}
