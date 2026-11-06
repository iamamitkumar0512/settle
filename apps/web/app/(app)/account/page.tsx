import { AccountPanel } from "./account-panel";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function AccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <h1 className="display text-4xl/11">Account</h1>
      <AccountPanel />
    </main>
  );
}
