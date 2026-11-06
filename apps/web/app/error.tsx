"use client";

import Link from "next/link";

// Shown if a page fails while it is drawn. Payments already sent are not affected.
export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <h1 className="display text-3xl">Something went wrong on this page</h1>
      <p className="text-muted">
        Nothing was charged or changed by this. Try again, and if it keeps happening, come back in
        a minute.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn">
          Go to Settle
        </Link>
      </div>
    </main>
  );
}
