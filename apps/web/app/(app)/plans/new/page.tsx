import Link from "next/link";
import { NewPlanForm } from "./new-plan-form";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function NewPlanPage() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div>
        <Link href="/plans" className="text-[13px]/[18px] text-accent-text">
          ← All plans
        </Link>
        <h1 className="display mt-2 text-4xl/11">New plan</h1>
      </div>
      <NewPlanForm />
    </main>
  );
}
