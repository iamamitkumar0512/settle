import { InvoicesPanel } from "./invoices-panel";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="display text-4xl/11">Invoices</h1>
        <p className="mt-0.5 text-muted">Get paid in USDT on Whitechain.</p>
      </div>
      <InvoicesPanel />
    </main>
  );
}
