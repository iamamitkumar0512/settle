import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="dark" className="theme-root flex min-h-dvh flex-col">
      <AppShell>{children}</AppShell>
    </div>
  );
}
