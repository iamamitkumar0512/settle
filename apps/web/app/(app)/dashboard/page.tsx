import Link from "next/link";
import { InvoicesPanel } from "./invoices-panel";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl/11">Invoices</h1>
          <p className="mt-0.5 text-muted">Get paid in USDT, by link or on your website.</p>
        </div>
        <Link href="/dashboard/new" className="btn btn-primary">
          New invoice
        </Link>
      </div>
      <InvoicesPanel />
    </main>
  );
}
