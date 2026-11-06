import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Settle",
  description: "The payment gateway for USDT on Whitechain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const privyAppId = process.env.PRIVY_APP_ID;
  if (!privyAppId) throw new Error("PRIVY_APP_ID is not configured");

  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers privyAppId={privyAppId}>{children}</Providers>
      </body>
    </html>
  );
}
