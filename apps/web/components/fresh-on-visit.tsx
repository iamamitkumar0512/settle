"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

// Next keeps a page's state after you leave it. Coming back through a link would then show the
// last result again, such as "Invoice #4 created" instead of an empty form. Keyed on the visit,
// what is inside starts fresh each time.
export function FreshOnVisit({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
