import Link from "next/link";
import { NewInvoiceForm } from "./new-invoice-form";

export default function NewInvoicePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-6 px-4 py-8 md:px-8">
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
