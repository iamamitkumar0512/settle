"use client";

import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <pre className="well overflow-x-auto text-[13px]/[20px]">
        <code>{code}</code>
      </pre>
      <div>
        <CopyButton text={code} label={label} />
      </div>
    </div>
  );
}
