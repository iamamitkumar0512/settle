import { Suspense } from "react";
import { SubscribePanel } from "./subscribe-panel";

export default function SubscribePage() {
  return (
    <Suspense>
      <SubscribePanel />
    </Suspense>
  );
}
