import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Order as SettleOrder } from "settle-pay";
import { shopSettle } from "../../settle";
import { AutoRefresh } from "./auto-refresh";

type Params = Promise<{ id: string }>;

function Status({ order, payUrl }: { order: SettleOrder; payUrl: string }) {
  if (order.status === "cancelled") {
    return (
      <>
        <h1 className="display text-2xl">This order was cancelled</h1>
        <p className="text-muted">Nothing was charged.</p>
      </>
    );
  }
  if (order.status === "open") {
    return (
      <>
        <span className="pill">Waiting for payment</span>
        <h1 className="display text-2xl">Your order is reserved</h1>
        <p className="text-muted">This page updates by itself once you have paid.</p>
        <a href={payUrl} className="btn btn-primary btn-wide">
          Pay {order.amount} USDT
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
        {order.amount} USDT received from{" "}
        <span className="figure">
          {order.payer?.slice(0, 6)}…{order.payer?.slice(-4)}
        </span>
        .
      </p>
      {Number(order.refunded) > 0 && (
        <p className="text-refund">{order.refunded} USDT refunded.</p>
      )}
      <p className="text-[13px]/[18px] text-muted">
        The shop read this from the contract on Whitechain, not from Settle&apos;s servers.
      </p>
      <Link href={`/pay/${order.id}/receipt`} className="btn btn-wide">
        View receipt
      </Link>
    </>
  );
}

async function Order({ params }: { params: Params }) {
  const { id } = await params;
  const settle = await shopSettle();
  if (!settle || !/^[1-9]\d{0,18}$/.test(id)) notFound();

  // An invoice from another business isn't one of this shop's orders.
  const order = await settle.orders.fetch(id).catch(() => null);
  if (!order) notFound();
  const payUrl = new URL(order.payUrl);
  payUrl.searchParams.set("return", `/shop/orders/${order.id}`);

  return (
    <section className="card mx-auto flex w-full max-w-[460px] flex-col items-center gap-3 p-6 text-center">
      <Status order={order} payUrl={payUrl.toString()} />
      <div className="mt-2 flex w-full justify-between gap-4 border-t border-line pt-4 text-left">
        <span>{order.description || "Your order"}</span>
        <span className="figure">{order.amount} USDT</span>
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
