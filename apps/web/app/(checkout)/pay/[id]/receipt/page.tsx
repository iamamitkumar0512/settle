import { Suspense } from "react";
import { ReceiptPanel } from "./receipt-panel";

export default function ReceiptPage() {
  return (
    <Suspense>
      <ReceiptPanel />
    </Suspense>
  );
}
