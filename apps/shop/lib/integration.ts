import { readFileSync } from "node:fs";
import path from "node:path";

const FILES = [
  { file: "lib/settle.ts", purpose: "Your keys, on your server" },
  { file: "app/api/orders/route.ts", purpose: "Create the order" },
  { file: "app/layout.tsx", purpose: "Load checkout" },
  { file: "components/buy-button.tsx", purpose: "Open checkout from the Buy button" },
  { file: "app/thanks/page.tsx", purpose: "Verify the payment before confirming" },
];

const WEBHOOK_FILE = {
  file: "app/api/webhooks/settle/route.ts",
  purpose: "Optional: get told by webhook",
};

// The Settle code in one of this store's files: whatever sits between its region markers.
function settleLines(file: string) {
  const lines = readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
  const body = lines.slice(
    lines.findIndex((line) => line.includes("#region settle")) + 1,
    lines.findIndex((line) => line.includes("#endregion")),
  );
  const indent = Math.min(...body.filter(Boolean).map((line) => line.search(/\S/)));
  return body.map((line) => line.slice(indent));
}

// Read from the real files when the page is built, so what it shows can't drift from the code.
export function storeIntegration() {
  const parts = FILES.map(({ file, purpose }) => ({ file, purpose, lines: settleLines(file) }));
  const webhook = { ...WEBHOOK_FILE, lines: settleLines(WEBHOOK_FILE.file) };
  return {
    parts,
    webhook,
    lineCount: parts.flatMap(({ lines }) => lines).filter(Boolean).length,
    webhookLineCount: webhook.lines.filter(Boolean).length,
  };
}
