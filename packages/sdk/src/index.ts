import { Client, toDecimal, type SettleOptions } from "./client";
import { Account, Orders, PaymentLinks, Payments, Refunds } from "./resources";

/**
 * Settle for your server. It works the way a card gateway's SDK does: create an order, open
 * checkout in the browser, verify the payment, and get told by webhook.
 *
 *   const settle = new Settle({ keyId, keySecret, businessName: "Chai Point" });
 *   const order = await settle.orders.create({ amount: "3.00", receipt: "order_42" });
 *   const payment = await settle.payments.verify(response);
 *
 * Your key signs each request and Settle's relayer submits it, so the account never needs gas.
 * Everything made here shows up in the Settle dashboard for the same account.
 */
export default class Settle {
  readonly orders: Orders;
  readonly payments: Payments;
  readonly refunds: Refunds;
  readonly paymentLinks: PaymentLinks;
  readonly account: Account;
  readonly #client: Client;

  constructor(options: SettleOptions) {
    this.#client = new Client(options);
    this.orders = new Orders(this.#client);
    this.payments = new Payments(this.#client);
    this.refunds = new Refunds(this.#client);
    this.paymentLinks = new PaymentLinks(this.#client);
    this.account = new Account(this.#client);
  }

  /** Current network fees and the smallest order. Settle adds no fee of its own. */
  async fees() {
    const { available, relayFee, withdrawFee, minInvoice } = await this.#client.quote();
    return {
      available,
      payment: toDecimal(relayFee),
      withdrawal: toDecimal(withdrawFee),
      minimumAmount: toDecimal(minInvoice),
    };
  }
}

export { Settle };
export { SettleError, type SettleOptions } from "./client";
export type {
  CheckoutResponse,
  NewOrder,
  NewPaymentLink,
  Order,
  OrderStatus,
  Payment,
  PaymentLink,
} from "./resources";
