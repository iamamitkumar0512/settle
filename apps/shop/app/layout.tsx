import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chai Point",
  description: "Small-batch tea and clay cups from Mumbai.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <Link href="/" className="wordmark">
            Chai Point
          </Link>
          <span className="tagline">Small-batch tea from Mumbai</span>
        </header>
        {children}
        <footer className="colophon">
          A demo store. Nothing ships. Payments are test USDT on Whitechain Sepolia.
        </footer>
        {/* #region settle */}
        <Script src={`${process.env.SETTLE_BASE_URL}/checkout.js`} />
        {/* #endregion */}
      </body>
    </html>
  );
}
