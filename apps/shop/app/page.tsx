import { BuyButton } from "@/components/buy-button";
import { ProductArt } from "@/components/product-art";
import { storeIntegration } from "@/lib/integration";
import { PRODUCTS } from "@/lib/products";

export default function StorePage() {
  const { parts, webhook, agent, lineCount, webhookLineCount } = storeIntegration();

  return (
    <main>
      <section className="hero">
        <span className="pill tone-paid">Pay with your email</span>
        <h1 className="display">Tea worth waiting for the kettle.</h1>
        <p>
          Small-batch tea and clay cups from Mumbai. There&apos;s no wallet to install and nothing
          to set up.
        </p>
      </section>

      <section aria-label="Products" className="products">
        {PRODUCTS.map((product) => (
          <article key={product.id} className="card product">
            <ProductArt id={product.id} tone={product.tone} />
            <h2 className="display">{product.name}</h2>
            <p className="product-detail">{product.detail}</p>
            <div className="price-row">
              <span className="figure price">{product.price} USDT</span>
              <BuyButton product={product.id} name={product.name} />
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="integration" className="integration">
        <h2 id="integration" className="display">
          How this store takes payment
        </h2>
        <p>
          Chai Point is a separate website that installed <code>@akhr2405/settle-pay</code>. These{" "}
          <strong>{lineCount} lines</strong> take a payment, and {webhookLineCount} more get it told
          by webhook. They are read from its own source files when the site is built. Every order
          lands in the merchant&apos;s Settle dashboard, where it can be refunded and exported.
        </p>
        <p>
          AI agents shop here too. The last {agent.lines.filter(Boolean).length} lines let an agent
          buy with no account and no API key, paying over x402. It can read the catalog at{" "}
          <code>/api/agent/catalog</code>.
        </p>
        {[...parts, webhook, agent].map(({ file, purpose, lines }) => (
          <figure key={file} className="card">
            <figcaption>
              <span>{purpose}</span>
              <code>{file}</code>
            </figcaption>
            <pre className="well">
              <code>{lines.join("\n")}</code>
            </pre>
          </figure>
        ))}
      </section>
    </main>
  );
}
