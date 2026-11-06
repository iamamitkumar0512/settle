"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  attachInvoicePdf,
  fetchInvoicePdf,
  pdfErrorMessage,
  pdfProblem,
} from "@/lib/invoice-pdf";
import { usePayLinkKey } from "@/lib/pay-link";
import { useInvoiceDetails } from "@/lib/use-invoice-details";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";

function DownloadPdf({ id }: { id: bigint }) {
  const session = useSession();
  const linkKey = usePayLinkKey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const credentials = session.credentials ?? undefined;

  // The key in a pay link opens the PDF by itself. Without it, the viewer has to be logged in.
  if (!linkKey && session.status !== "ready") {
    return (
      <p className="text-[13px]/[18px] text-muted">A PDF invoice is attached. Log in to open it.</p>
    );
  }
  // A wallet that skipped the sign-in message has to prove itself before the PDF is released.
  if (!linkKey && !credentials) {
    return (
      <button type="button" className="btn" onClick={() => session.signIn().catch(() => undefined)}>
        Sign in to open the PDF invoice
      </button>
    );
  }

  async function download() {
    setError(undefined);
    setBusy(true);
    const result = await fetchInvoicePdf(id, { linkKey, credentials });
    setBusy(false);
    if (!result.ok) return setError(pdfErrorMessage(result.error));

    const url = URL.createObjectURL(result.pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${id}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={download}>
        {busy ? "Opening the PDF…" : "Download PDF invoice"}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
    </>
  );
}

function AttachPdf({ id }: { id: bigint }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  if (!session.credentials) return null;
  const credentials = session.credentials;

  async function choose(file: File | undefined) {
    if (!file) return;
    const problem = pdfProblem(file);
    if (problem) return setError(problem);

    setError(undefined);
    setUploading(true);
    const result = await attachInvoicePdf(id, file, credentials);
    setUploading(false);
    if (!result.ok) return setError(pdfErrorMessage(result.error));
    await queryClient.invalidateQueries({ queryKey: ["invoice-details", String(id)] });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="field">
        Attach a PDF invoice
        <input
          className="input"
          type="file"
          accept="application/pdf"
          disabled={uploading}
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </label>
      <p role="status" className="text-[13px]/[18px] text-muted">
        {uploading
          ? "Encrypting and uploading to Swarm…"
          : "Up to 2 MB. Stored encrypted on Swarm. Only you and your customer can open it."}
      </p>
      {error && (
        <p role="alert" className="text-[13px]/[18px] text-late">
          {error}
        </p>
      )}
    </div>
  );
}

// The invoice's PDF: a download button when one is attached, or the upload field for its
// merchant when none is.
export function InvoicePdf({
  id,
  canAttach = false,
  className,
}: {
  id: bigint;
  canAttach?: boolean;
  className?: string;
}) {
  const { data: details } = useInvoiceDetails(id);
  const quote = useRelayQuote();

  if (details?.hasPdf) {
    return (
      <div className={className}>
        <DownloadPdf id={id} />
      </div>
    );
  }
  if (canAttach && details && quote.canAttachPdf) {
    return (
      <div className={className}>
        <AttachPdf id={id} />
      </div>
    );
  }
  return null;
}
