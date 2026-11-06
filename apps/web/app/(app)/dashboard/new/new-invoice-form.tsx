"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Hash, Hex } from "viem";
import { InvoicePdf } from "@/components/invoice-pdf";
import { explorerTxUrl, formatDate, formatUsdt } from "@/lib/format";
import {
  dueDateToUnix,
  hashInvoiceDetails,
  INVOICE_LIMITS,
  isValidEmail,
  newSalt,
  parseUsdtAmount,
  type InvoiceDetails,
} from "@/lib/invoice";
import { attachInvoicePdf, pdfErrorMessage, pdfProblem } from "@/lib/invoice-pdf";
import { postJson } from "@/lib/relay-client";
import { saveInvoiceDetails } from "@/lib/save-invoice-details";
import { createInvoiceRequest } from "@/lib/typed-data";
import { useRelayQuote } from "@/lib/use-relay-quote";
import { useSession } from "@/lib/use-session";
import { useSignedAction } from "@/lib/use-signed-action";

// A character takes up to 4 bytes in UTF-8, so these always fit the byte limits.
const MAX_MERCHANT_NAME = Math.floor(INVOICE_LIMITS.merchantNameBytes / 4);
const MAX_CUSTOMER_FIELD = Math.floor(INVOICE_LIMITS.customerFieldBytes / 4);
const MAX_MEMO = Math.floor(INVOICE_LIMITS.memoBytes / 4);

const EMPTY_FORM = {
  merchantName: "",
  customerName: "",
  customerEmail: "",
  memo: "",
  amount: "",
  dueDate: "",
};

type SaveState = "saving" | "saved" | "failed";
type CreatedInvoice = { id: bigint; hash: Hash; details: InvoiceDetails; salt: Hex };

function displayAmount(text: string) {
  return formatUsdt(parseUsdtAmount(text) ?? 0n);
}

function displayDate(date: string) {
  return date ? formatDate(new Date(`${date}T00:00:00`)) : "—";
}

function CreatedPanel({
  id,
  hash,
  saveState,
  pdfUploading,
  pdfError,
  onRetrySave,
  onReset,
}: {
  id: bigint;
  hash: Hash;
  saveState: SaveState;
  pdfUploading: boolean;
  pdfError?: string;
  onRetrySave: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const payUrl = `${window.location.origin}/pay/${id}`;

  async function copyLink() {
    await navigator.clipboard.writeText(payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="card flex flex-col gap-4 p-6" role="status">
      <div className="flex items-center justify-between gap-4">
        <h2 className="display text-xl">
          Invoice <span className="figure">#{String(id)}</span> created
        </h2>
        <span className="pill">Open</span>
      </div>
      <div className="well flex flex-wrap items-center justify-between gap-3">
        <span className="figure text-[13px]/[18px] break-all">{payUrl}</span>
        <button type="button" className="btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy pay link"}
        </button>
      </div>
      {saveState === "failed" ? (
        <div role="alert" className="well flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px]/[18px] text-late">
            The invoice exists, but its details weren&apos;t saved. Stay on this page and retry.
          </span>
          <button type="button" className="btn" onClick={onRetrySave}>
            Retry saving
          </button>
        </div>
      ) : (
        <p className="text-[13px]/[18px] text-muted">
          {saveState === "saving" ? "Saving invoice details…" : "Invoice details saved."}
        </p>
      )}
      {pdfUploading ? (
        <p className="text-[13px]/[18px] text-muted">Encrypting and uploading your PDF to Swarm…</p>
      ) : (
        <>
          {pdfError && (
            <p role="alert" className="text-[13px]/[18px] text-late">
              The PDF wasn&apos;t attached. {pdfError} You can choose it again below.
            </p>
          )}
          <InvoicePdf id={id} canAttach />
        </>
      )}
      <a
        href={explorerTxUrl(hash)}
        target="_blank"
        rel="noreferrer"
        className="text-[13px]/[18px] text-accent-text"
      >
        View on explorer ↗
      </a>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" disabled={saveState === "saving"} onClick={onReset}>
          Create another
        </button>
        <Link href="/dashboard" className="btn btn-primary">
          Back to invoices
        </Link>
      </div>
    </section>
  );
}

export function NewInvoiceForm() {
  const session = useSession();
  const action = useSignedAction();
  const quote = useRelayQuote();

  const [form, setForm] = useState(EMPTY_FORM);
  const [amountError, setAmountError] = useState<string>();
  const [dateError, setDateError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [emailError, setEmailError] = useState<string>();
  const [created, setCreated] = useState<CreatedInvoice>();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const queryClient = useQueryClient();
  const [pdf, setPdf] = useState<File>();
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState<string>();

  const { relayFee } = quote;
  const minimum = quote.minInvoice > relayFee ? quote.minInvoice : relayFee + 1n;
  const busy = action.busy;

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveDetails(invoice: CreatedInvoice) {
    setSaveState("saving");
    const saved = await saveInvoiceDetails(invoice.id, invoice.details, invoice.salt).catch(
      () => false,
    );
    setSaveState(saved ? "saved" : "failed");
  }

  function reset() {
    setForm(EMPTY_FORM);
    action.clearError();
    setCreated(undefined);
    setPdf(undefined);
    setPdfError(undefined);
  }

  function choosePdf(file: File | undefined) {
    setPdfError(file && pdfProblem(file));
    setPdf(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !session.address) return;

    const amount = parseUsdtAmount(form.amount);
    const dueAt = dueDateToUnix(form.dueDate);
    const amountValid = amount !== null && amount >= minimum;
    setAmountError(
      amount === null
        ? "Enter an amount above 0, with up to 6 decimals."
        : amountValid
          ? undefined
          : `Enter at least ${formatUsdt(minimum)} USDT.`,
    );
    setDateError(dueAt === null ? "Choose today or a later date." : undefined);
    setNameError(form.merchantName.trim() ? undefined : "Enter your business name.");
    const emailValid = isValidEmail(form.customerEmail);
    setEmailError(
      emailValid ? undefined : "Enter your customer's email, so they can find this invoice.",
    );
    if (!amountValid || dueAt === null || !form.merchantName.trim() || !emailValid) return;
    if (pdf && pdfProblem(pdf)) return;

    const { merchantName, customerName, customerEmail, memo } = form;
    const details = { merchantName, customerName, customerEmail, memo };
    const salt = newSalt();
    const typed = createInvoiceRequest({
      merchant: session.address,
      amount,
      dueAt,
      ref: hashInvoiceDetails(details, salt),
      relayFee,
      salt: newSalt(),
    });

    // One request: the server creates the invoice on-chain and saves its details.
    const data = await action.run(typed, (signature) =>
      postJson("/api/relay/create", {
        request: typed.message,
        signature,
        details: { ...details, salt },
      }),
    );
    if (!data) return;

    const invoice = { id: BigInt(data.id as string), hash: data.txHash as Hash, details, salt };
    setCreated(invoice);
    setSaveState(data.saved ? "saved" : "failed");

    // The PDF goes up after the invoice exists, because its record points at the invoice id.
    if (pdf && session.credentials && data.saved) {
      setPdfUploading(true);
      const attached = await attachInvoicePdf(invoice.id, pdf, session.credentials);
      setPdfError(attached.ok ? undefined : pdfErrorMessage(attached.error));
      await queryClient.invalidateQueries({ queryKey: ["invoice-details", String(invoice.id)] });
      setPdfUploading(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
        {created ? (
          <CreatedPanel
            id={created.id}
            hash={created.hash}
            saveState={saveState}
            pdfUploading={pdfUploading}
            pdfError={pdfError}
            onRetrySave={() => saveDetails(created)}
            onReset={reset}
          />
        ) : (
          <form className="card flex flex-col gap-5 p-6" onSubmit={onSubmit} noValidate>
            <fieldset disabled={busy} className="flex flex-col gap-5">
              <legend className="sr-only">Invoice details</legend>
              <label className="field">
                Your business name
                <input
                  className="input"
                  type="text"
                  autoComplete="organization"
                  maxLength={MAX_MERCHANT_NAME}
                  aria-invalid={nameError ? true : undefined}
                  value={form.merchantName}
                  onChange={(event) => update("merchantName", event.target.value)}
                />
                {nameError && (
                  <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                    {nameError}
                  </span>
                )}
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  Customer
                  <input
                    className="input"
                    type="text"
                    autoComplete="off"
                    maxLength={MAX_CUSTOMER_FIELD}
                    value={form.customerName}
                    onChange={(event) => update("customerName", event.target.value)}
                  />
                </label>
                <label className="field">
                  Customer email
                  <input
                    className="input"
                    type="email"
                    autoComplete="off"
                    maxLength={MAX_CUSTOMER_FIELD}
                    aria-invalid={emailError ? true : undefined}
                    value={form.customerEmail}
                    onChange={(event) => update("customerEmail", event.target.value)}
                  />
                  {emailError && (
                    <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                      {emailError}
                    </span>
                  )}
                </label>
              </div>
              <label className="field">
                What is this for?
                <input
                  className="input"
                  type="text"
                  autoComplete="off"
                  maxLength={MAX_MEMO}
                  value={form.memo}
                  onChange={(event) => update("memo", event.target.value)}
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  Amount
                  <span className="relative block">
                    <input
                      className="input figure pr-18 text-xl"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      aria-invalid={amountError ? true : undefined}
                      value={form.amount}
                      onChange={(event) => update("amount", event.target.value)}
                    />
                    <span className="figure absolute right-3.5 top-3.5 text-muted">USDT</span>
                  </span>
                  {amountError && (
                    <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                      {amountError}
                    </span>
                  )}
                </label>
                <label className="field">
                  Due date
                  <input
                    className="input"
                    type="date"
                    aria-invalid={dateError ? true : undefined}
                    value={form.dueDate}
                    onChange={(event) => update("dueDate", event.target.value)}
                  />
                  {dateError && (
                    <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                      {dateError}
                    </span>
                  )}
                </label>
              </div>
              {quote.canAttachPdf && session.credentials && (
                <label className="field">
                  PDF invoice (optional)
                  <input
                    className="input"
                    type="file"
                    accept="application/pdf"
                    aria-invalid={pdfError ? true : undefined}
                    onChange={(event) => choosePdf(event.target.files?.[0])}
                  />
                  {pdfError ? (
                    <span role="alert" className="text-[13px]/[18px] font-normal text-late">
                      {pdfError}
                    </span>
                  ) : (
                    <span className="text-[13px]/[18px] font-normal text-muted">
                      Up to 2 MB. Stored encrypted on Swarm. Only you and your customer can open it.
                    </span>
                  )}
                </label>
              )}
            </fieldset>
            {quote.available ? (
              <div className="well flex items-baseline justify-between gap-4 text-[13px]/[18px]">
                <span className="text-muted">Settle fee, taken when the invoice is paid</span>
                <span className="figure">{formatUsdt(relayFee)} USDT</span>
              </div>
            ) : (
              !quote.isPending && (
                <p role="alert" className="well text-[13px]/[18px] text-late">
                  Settle can&apos;t send transactions right now, so invoices can&apos;t be created.
                </p>
              )
            )}
            {action.error && (
              <p role="alert" className="text-[13px]/[18px] text-late">
                {action.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Link href="/dashboard" className="btn">
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary min-w-[200px]"
                disabled={busy || !quote.available}
              >
                {action.label("Create invoice", "Creating invoice…")}
              </button>
            </div>
          </form>
        )}

        <aside aria-label="What your customer sees" className="flex flex-col gap-2.5">
          <div className="label">What your customer sees</div>
          <div data-theme="light" className="theme-root rounded-[14px] p-6">
            <div className="card flex flex-col gap-4 p-6">
              <div className="display text-lg">{form.merchantName || "—"}</div>
              <div>
                <div className="text-[13px]/[18px] text-muted">
                  {form.memo || "—"}
                </div>
                <div className="figure mt-1 text-4xl/11 break-all">
                  {displayAmount(form.amount)} <span className="text-base text-muted">USDT</span>
                </div>
              </div>
              <div className="flex justify-between gap-4 text-[13px]/[18px]">
                <span className="text-muted">Billed to</span>
                <span>{form.customerName || "—"}</span>
              </div>
              <div className="flex justify-between gap-4 text-[13px]/[18px]">
                <span className="text-muted">Due</span>
                <span>{displayDate(form.dueDate)}</span>
              </div>
              <div className="btn btn-primary btn-wide cursor-default">
                Pay {displayAmount(form.amount)} USDT
              </div>
            </div>
          </div>
        </aside>
    </div>
  );
}
