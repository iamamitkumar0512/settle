import { BuyButton } from "@/components/buy-button";
import { storeIntegration } from "@/lib/integration";
import { PRODUCTS } from "@/lib/products";

export default function StorePage() {
  const { parts, webhook, lineCount, webhookLineCount } = storeIntegration();

  return (
    <main>
      <section className="hero">
        <h1>Tea worth waiting for the kettle.</h1>
        <p>Pay with your email address. There&apos;s no wallet to install and nothing to set up.</p>
      </section>

      <section aria-label="Products" className="products">
        {PRODUCTS.map((product) => (
          <article key={product.id} className="product">
            <div className="swatch" style={{ background: product.tone }} aria-hidden="true">
              <span>{product.name.charAt(0)}</span>
            </div>
            <h2>{product.name}</h2>
            <p>{product.detail}</p>
            <div className="price-row">
              <span className="price">{product.price} USDT</span>
              <BuyButton product={product.id} name={product.name} />
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="integration" className="integration">
        <h2 id="integration">How this store takes payment</h2>
        <p>
          Chai Point is a separate website that installed <code>settle-pay</code>. These{" "}
          <strong>{lineCount} lines</strong> take a payment, and {webhookLineCount} more get it told
          by webhook. They are read from its own source files when the site is built. Every order
          lands in the merchant&apos;s Settle dashboard, where it can be refunded and exported.
        </p>
        {[...parts, webhook].map(({ file, purpose, lines }) => (
          <figure key={file}>
            <figcaption>
              <span>{purpose}</span>
              <code>{file}</code>
            </figcaption>
            <pre>
              <code>{lines.join("\n")}</code>
            </pre>
          </figure>
        ))}
      </section>
    </main>
  );
}
