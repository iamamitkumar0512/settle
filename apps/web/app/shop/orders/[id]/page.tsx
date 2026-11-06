import { formatUsdt, type Invoice } from "@settle/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { shopSettle } from "../../settle";
import { AutoRefresh } from "./auto-refresh";

type Params = Promise<{ id: string }>;

function usdt(amount: bigint) {
  return `${Number(formatUsdt(amount)).toFixed(2)} USDT`;
}

function Status({ invoice, payUrl }: { invoice: Invoice; payUrl: string }) {
  if (invoice.status === "cancelled") {
    return (
      <>
        <h1 className="display text-2xl">This order was cancelled</h1>
        <p className="text-muted">Nothing was charged.</p>
      </>
    );
  }
  if (invoice.status === "open") {
    return (
      <>
        <span className="pill">Waiting for payment</span>
        <h1 className="display text-2xl">Your order is reserved</h1>
        <p className="text-muted">This page updates by itself once you have paid.</p>
        <a href={payUrl} className="btn btn-primary btn-wide">
          Pay {usdt(invoice.amount)}
        </a>
        <AutoRefresh />
      </>
    );
  }
  return (
    <>
      <span className="pill tone-paid">Paid</span>
      <h1 className="display text-2xl">Order confirmed</h1>
      <p className="text-muted">
        {usdt(invoice.amount)} received from{" "}
        <span className="figure">
          {invoice.payer?.slice(0, 6)}…{invoice.payer?.slice(-4)}
        </span>
        .
      </p>
      {invoice.refunded > 0n && <p className="text-refund">{usdt(invoice.refunded)} refunded.</p>}
      <p className="text-[13px]/[18px] text-muted">
        The shop read this from the contract on Whitechain, not from Settle&apos;s servers.
      </p>
      <Link href={`/pay/${invoice.id}/receipt`} className="btn btn-wide">
        View receipt
      </Link>
    </>
  );
}

async function Order({ params }: { params: Params }) {
  const { id } = await params;
  const settle = await shopSettle();
  if (!settle || !/^[1-9]\d{0,18}$/.test(id)) notFound();

  const invoice = await settle.getInvoice(BigInt(id)).catch(() => null);
  // An invoice from another business isn't one of this shop's orders.
  if (!invoice || invoice.merchant !== settle.address) notFound();
  const details = await settle.getInvoiceDetails(invoice.id).catch(() => null);

  return (
    <section className="card mx-auto flex w-full max-w-[460px] flex-col items-center gap-3 p-6 text-center">
      <Status
        invoice={invoice}
        payUrl={settle.payUrl(invoice.id, { returnPath: `/shop/orders/${invoice.id}` })}
      />
      <div className="mt-2 flex w-full justify-between gap-4 border-t border-line pt-4 text-left">
        <span>{details?.memo || "Your order"}</span>
        <span className="figure">{usdt(invoice.amount)}</span>
      </div>
      <Link href="/shop" className="text-[13px]/[18px] text-accent-text">
        Back to the shop
      </Link>
    </section>
  );
}

export default function OrderPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col justify-center">
      <Suspense fallback={<p className="text-center text-muted">Loading your order…</p>}>
        <Order params={params} />
      </Suspense>
    </main>
  );
}
