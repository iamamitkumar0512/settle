import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { DocsContent } from "./docs-content";

export const metadata: Metadata = {
  title: "Docs · Settle",
  description: "Add Settle Checkout to your website and take USDT on Whitechain.",
};

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <DocsContent demoStore={process.env.NEXT_PUBLIC_DEMO_STORE_URL} />
      <SiteFooter />
    </div>
  );
}
