export default function PayLayout({ children }: LayoutProps<"/pay">) {
  return (
    <div data-theme="light" className="theme-root flex min-h-dvh flex-col">
      {children}
      <footer className="p-4 text-center text-[13px]/[18px] text-muted">Secured by Settle</footer>
    </div>
  );
}
