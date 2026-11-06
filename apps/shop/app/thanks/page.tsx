import Link from "next/link";
import type { CheckoutResponse } from "@akhr2405/settle-pay";
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
        <section className="card confirmation-card">
          <h1 className="display">We couldn&apos;t confirm this payment</h1>
          <p className="muted">If you did pay, write to us and we&apos;ll sort it out.</p>
          <Link href="/" className="btn btn-primary btn-wide">
            Back to the store
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="confirmation">
      <section className="card confirmation-card">
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="26" fill="#C8F04D" />
          <path
            d="M16 27l7 7 13-15"
            fill="none"
            stroke="#161C04"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="pill tone-paid">Order confirmed</span>
        <h1 className="display">Thank you. Your tea is on its way.</h1>
        <dl className="well details">
          <div>
            <dt>Item</dt>
            <dd>{payment.description}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd className="figure">{payment.amount} USDT</dd>
          </div>
          <div>
            <dt>Order number</dt>
            <dd className="figure">{payment.receipt}</dd>
          </div>
        </dl>
        <a href={payment.receiptUrl} className="btn btn-primary btn-wide">
          View your receipt
        </a>
        <Link href="/" className="quiet">
          Back to the store
        </Link>
      </section>
    </main>
  );
}
