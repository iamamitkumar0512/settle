"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

declare global {
  interface Window {
    Settle?: { Checkout: new (options: object) => { open(): void } };
  }
}

function createOrder(product: string) {
  return fetch("/api/orders", { method: "POST", body: JSON.stringify({ product }) })
    .then((response) => response.json())
    .then((order) => order.id);
}

export function BuyButton({ product, name }: { product: string; name: string }) {
  const router = useRouter();
  const [problem, setProblem] = useState("");

  function buy() {
    setProblem("");
    if (!window.Settle) return setProblem("Checkout isn't available right now. Try again soon.");

    // #region settle
    new window.Settle.Checkout({
      orderId: () => createOrder(product),
      handler: (response: Record<string, string>) =>
        router.push(`/thanks?${new URLSearchParams(response)}`),
      onError: () => setProblem("We couldn't start your order. Try again."),
    }).open();
    // #endregion
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={buy} aria-label={`Buy ${name}`}>
        Buy
      </button>
      {problem && (
        <p role="alert" className="problem">
          {problem}
        </p>
      )}
    </>
  );
}
