import type { ReactNode } from "react";

// Public pages a customer opens from a link: lighter, with no app navigation.
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="theme-root flex min-h-dvh flex-col">
      {children}
      <footer className="p-4 text-center text-[13px]/[18px] text-muted">Secured by Settle</footer>
    </div>
  );
}
