import { SiteHeader } from "@/components/site-header";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div data-theme="dark" className="theme-root flex min-h-dvh flex-col">
      <SiteHeader />
      {children}
    </div>
  );
}
