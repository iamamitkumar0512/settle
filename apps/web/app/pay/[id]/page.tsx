import { Suspense } from "react";
import { PayPanel } from "./pay-panel";

export default function PayPage() {
  return (
    <Suspense>
      <PayPanel />
    </Suspense>
  );
}
