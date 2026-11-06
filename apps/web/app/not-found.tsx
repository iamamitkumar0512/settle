import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-[76px] w-full max-w-[1240px] items-center px-4 md:px-8">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 pb-24 text-center">
        <h1 className="display text-3xl">We can&apos;t find that page</h1>
        <p className="text-muted">The link may be old, or the address may be mistyped.</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn btn-primary">
            Go to Settle
          </Link>
          <Link href="/dashboard" className="btn">
            Open your dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
