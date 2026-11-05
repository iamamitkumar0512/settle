import Link from "next/link";
import { Logo } from "@/components/logo";
import { ChainStatus } from "./chain-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6">
      <Logo />
      <h1 className="display text-5xl/14">Get paid in USDT.</h1>
      <ChainStatus />
      <Link href="/dashboard" className="btn btn-primary self-start">
        Open dashboard
      </Link>
    </main>
  );
}
