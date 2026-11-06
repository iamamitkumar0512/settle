import Link from "next/link";
import { Suspense } from "react";
import { InvoiceDetail } from "./invoice-detail";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function InvoicePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-1 flex-col gap-6">
      <Link href="/dashboard" className="text-[13px]/[18px] text-accent-text">
        ← All invoices
      </Link>
      <Suspense>
        <InvoiceDetail />
      </Suspense>
    </main>
  );
}
