import { ChainStatus } from "./chain-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-6">
      <h1 className="text-3xl font-semibold">Settle</h1>
      <p>Stablecoin invoicing on Whitechain.</p>
      <ChainStatus />
    </main>
  );
}
