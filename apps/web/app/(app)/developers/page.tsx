import { DevelopersPanel } from "./developers-panel";

// These pages only render after login, so there is nothing to prerender for an instant navigation.
export const instant = false;

export default function DevelopersPage() {
  return <DevelopersPanel />;
}
