import Link from "next/link";
import { NewInvoiceForm } from "./new-invoice-form";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function NewInvoicePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-6">
      <div>
        <Link href="/dashboard" className="text-[13px]/[18px] text-accent-text">
          ← All invoices
        </Link>
        <h1 className="display mt-2 text-4xl/11">New invoice</h1>
      </div>
      <NewInvoiceForm />
    </main>
  );
}
