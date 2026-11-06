/*
 * Settle Checkout. A store loads this file from its Settle, then opens checkout for an order:
 *
 *   <script src="https://<your Settle>/checkout.js"></script>
 *   new Settle.Checkout({
 *     orderId: "42",
 *     handler: (response) => { ... },  // { settle_order_id, settle_payment_id }
 *     onDismiss: () => { ... },        // the customer closed checkout without paying
 *   }).open();
 *
 * Checkout opens in its own window, so the customer never leaves the store's page. Call open()
 * from a click, or the browser blocks the window. If it is blocked anyway, or with
 * `redirect: true`, the whole page goes to Settle and comes back through the order's callbackUrl.
 *
 * The handler's response says a payment happened. Confirm it on your server before you ship
 * anything: settle.payments.verify(response). If the customer closes the window while a payment
 * is still going through, onDismiss runs and the payment can still land. A webhook tells you.
 */
(() => {
  "use strict";

  // The Settle this file was loaded from is the one it opens.
  const home = document.currentScript ? new URL(document.currentScript.src).origin : "";

  const WIDTH = 480;
  const HEIGHT = 760;

  function backdrop(onShow, onCancel) {
    const cover = document.createElement("div");
    cover.setAttribute("role", "dialog");
    cover.setAttribute("aria-modal", "true");
    cover.setAttribute("aria-label", "Settle Checkout");
    cover.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;" +
      "justify-content:center;padding:16px;background:rgba(11,13,18,.72);" +
      "font:15px/22px system-ui,-apple-system,Segoe UI,sans-serif;color:#f2f4f7;text-align:center";

    const box = document.createElement("div");
    box.style.cssText = "max-width:340px";
    const title = document.createElement("div");
    title.textContent = "Finish paying in the Settle window";
    title.style.cssText = "font-size:20px;line-height:28px;font-weight:600;margin-bottom:6px";
    const hint = document.createElement("div");
    hint.textContent = "Can't see it? It may be behind this one.";
    hint.style.cssText = "color:#9ba5b4;margin-bottom:18px";

    const button = (label, primary, onClick) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = label;
      element.style.cssText =
        "min-height:44px;padding:0 18px;margin:0 4px;border-radius:10px;font:inherit;" +
        "font-weight:600;cursor:pointer;" +
        (primary
          ? "border:1px solid #c8f04d;background:#c8f04d;color:#161c04"
          : "border:1px solid #5b6577;background:transparent;color:#f2f4f7");
      element.addEventListener("click", onClick);
      return element;
    };

    box.append(title, hint, button("Show the window", true, onShow), button("Cancel", false, onCancel));
    cover.append(box);
    document.body.append(cover);
    return cover;
  }

  class Checkout {
    constructor(options) {
      if (!options || !/^[1-9]\d*$/.test(String(options.orderId))) {
        throw new Error("Settle.Checkout needs the orderId of an order you created");
      }
      this.options = options;
      this.origin = String(options.baseUrl || home).replace(/\/$/, "");
      if (!this.origin) throw new Error("Settle.Checkout needs baseUrl when loaded without a script tag");
      this.session = null;
    }

    open() {
      if (this.session) {
        this.session.popup.focus();
        return;
      }
      const { options, origin } = this;
      const payUrl = `${origin}/pay/${options.orderId}`;
      if (options.redirect) {
        window.location.assign(payUrl);
        return;
      }

      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - WIDTH) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - HEIGHT) / 2));
      const popup = window.open(
        `${payUrl}?popup=1&origin=${encodeURIComponent(window.location.origin)}`,
        "settle-checkout",
        `popup=yes,width=${WIDTH},height=${HEIGHT},left=${left},top=${top}`,
      );
      // A blocked window must not cost the store a sale: the whole page goes to Settle instead.
      if (!popup) {
        window.location.assign(payUrl);
        return;
      }

      const onMessage = (event) => {
        // Only the Settle window this page opened may report a payment.
        if (event.origin !== origin || event.source !== popup) return;
        const data = event.data;
        if (!data || data.type !== "settle:paid") return;
        if (String(data.settle_order_id) !== String(options.orderId)) return;
        this.#end();
        if (typeof options.handler === "function") {
          options.handler({
            settle_order_id: String(data.settle_order_id),
            settle_payment_id: data.settle_payment_id,
          });
        }
      };
      window.addEventListener("message", onMessage);

      // A closed window with no payment means the customer walked away.
      const watch = setInterval(() => {
        if (!popup.closed) return;
        this.#end();
        if (typeof options.onDismiss === "function") options.onDismiss();
      }, 400);

      const cover = backdrop(
        () => popup.focus(),
        () => popup.close(),
      );
      this.session = { popup, onMessage, watch, cover };
    }

    /** Closes checkout without a payment. onDismiss runs. */
    close() {
      if (this.session) this.session.popup.close();
    }

    #end() {
      const session = this.session;
      if (!session) return;
      this.session = null;
      clearInterval(session.watch);
      window.removeEventListener("message", session.onMessage);
      session.cover.remove();
    }
  }

  window.Settle = Object.assign(window.Settle || {}, { Checkout });
})();
