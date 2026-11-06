import { CheckoutForm } from "./checkout-form";

const INTEGRATION = `import { Settle } from "@settle/sdk";

const settle = new Settle({ baseUrl, account });

// Checkout: create the order, send the customer to pay.
const order = await settle.createInvoice({
  amount: product.price,
  dueAt: inAWeek,
  businessName: "Chai Point",
  customer,
  memo: product.name,
});
redirect(order.payUrl);

// Order page: read the payment from the contract.
const invoice = await settle.getInvoice(order.id);
if (invoice.status === "paid") confirmOrder();`;

export default function ShopPage() {
  return (
    <main className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-5">
        <div>
          <h1 className="display text-4xl/11">Tea, paid in USDT</h1>
          <p className="mt-1 text-muted">Pay with your email or your wallet. You need no gas.</p>
        </div>
        <CheckoutForm />
      </section>
      <aside aria-label="How this shop takes payment" className="flex flex-col gap-3">
        <h2 className="display text-xl">The whole integration</h2>
        <p className="text-muted">
          This shop has no payment code of its own. Its server holds one wallet key and calls the
          Settle SDK. Orders appear in the Settle dashboard for that wallet.
        </p>
        <pre className="well overflow-x-auto text-[13px]/[20px]">
          <code>{INTEGRATION}</code>
        </pre>
      </aside>
    </main>
  );
}
