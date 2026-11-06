"use client";

import { useActionState } from "react";
import { checkout } from "./actions";
import { PRODUCTS } from "./products";

export function CheckoutForm() {
  const [state, action, pending] = useActionState(checkout, {});

  return (
    <form action={action} className="card flex flex-col gap-5 p-6">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="label mb-2.5">Choose a product</legend>
        {PRODUCTS.map((product, index) => (
          <label
            key={product.id}
            className="well flex cursor-pointer items-center gap-3 has-checked:outline-2 has-checked:outline-accent-text"
          >
            <input type="radio" name="product" value={product.id} defaultChecked={index === 0} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{product.name}</span>
              <span className="block text-[13px]/[18px] text-muted">{product.detail}</span>
            </span>
            <span className="figure">{product.price} USDT</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        Your email or wallet address
        <input className="input" type="text" name="customer" autoComplete="email" required />
        <span className="text-[13px]/[18px] font-normal text-muted">
          Your order shows up under this in Settle, so you can find it again.
        </span>
      </label>
      {state.error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-wide" disabled={pending}>
        {pending ? "Creating your order…" : "Buy with USDT"}
      </button>
    </form>
  );
}
