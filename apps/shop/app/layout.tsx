import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chai Point",
  description: "Small-batch tea and clay cups from Mumbai.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}>
      <body>
        <header className="masthead">
          <div className="masthead-inner">
            <Link href="/" className="brand display">
              <span className="brand-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1a3 3 0 0 1 0 6h-1M8 3v2M12 3v2" />
                </svg>
              </span>
              Chai Point
            </Link>
            <span className="pill tone-due">Demo store</span>
          </div>
        </header>
        {children}
        <footer className="colophon">
          Sample products. Nothing ships. Payments are test USDT on Whitechain Sepolia, taken with{" "}
          <a href={process.env.SETTLE_BASE_URL}>Settle</a>.
        </footer>
        {/* #region settle */}
        <Script src={`${process.env.SETTLE_BASE_URL}/checkout.js`} />
        {/* #endregion */}
      </body>
    </html>
  );
}
