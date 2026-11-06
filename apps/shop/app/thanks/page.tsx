import Link from "next/link";
import type { CheckoutResponse } from "settle-pay";
import { settle } from "@/lib/settle";

type Props = { searchParams: Promise<CheckoutResponse> };

export default async function ThanksPage({ searchParams }: Props) {
  const response = await searchParams;

  // #region settle
  const payment = await settle().payments.verify(response).catch(() => null);
  // #endregion

  if (!payment) {
    return (
      <main className="confirmation">
        <h1>We couldn&apos;t confirm this payment</h1>
        <p>If you did pay, write to us and we&apos;ll sort it out.</p>
        <Link href="/" className="buy">
          Back to the store
        </Link>
      </main>
    );
  }

  return (
    <main className="confirmation">
      <p className="eyebrow">Order confirmed</p>
      <h1>Thank you. Your tea is on its way.</h1>
      <dl>
        <div>
          <dt>Item</dt>
          <dd>{payment.description}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{payment.amount} USDT</dd>
        </div>
        <div>
          <dt>Order number</dt>
          <dd>{payment.receipt}</dd>
        </div>
      </dl>
      <a href={payment.receiptUrl} className="buy">
        View your receipt
      </a>
      <Link href="/" className="quiet">
        Back to the store
      </Link>
    </main>
  );
}
