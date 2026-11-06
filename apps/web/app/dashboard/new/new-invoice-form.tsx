"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { formatEther, parseEventLogs, zeroHash, type Hash, type Hex } from "viem";
import { useConnection, usePublicClient, useWriteContract } from "wagmi";
import { WalletGate } from "@/components/wallet-gate";
import { whitechainSepolia } from "@/lib/chains";
import { invoiceRegistryAbi, registry, REGISTRY_ADDRESS } from "@/lib/contracts";
import { explorerTxUrl, formatDate, formatUsdt } from "@/lib/format";
import {
  dueDateToUnix,
  hashInvoiceDetails,
  INVOICE_LIMITS,
  newSalt,
  parseUsdtAmount,
  type InvoiceDetails,
} from "@/lib/invoice";
import { saveInvoiceDetails } from "@/lib/save-invoice-details";
import { isInsufficientGas, isUserRejection } from "@/lib/wallet-errors";

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

type Stage = "editing" | "wallet" | "confirming";
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
  onRetrySave,
  onReset,
}: {
  id: bigint;
  hash: Hash;
  saveState: SaveState;
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
  const client = usePublicClient({ chainId: whitechainSepolia.id });
  const { address } = useConnection();
  const write = useWriteContract();
  const fee = useQuery({
    queryKey: ["create-invoice-fee", address],
    enabled: Boolean(client && address),
    refetchInterval: 60_000,
    queryFn: async () => {
      const dueAt = BigInt(Math.floor(Date.now() / 1000) + 86_400);
      const [gas, gasPrice] = await Promise.all([
        client!.estimateContractGas({
          ...registry,
          functionName: "create",
          args: [1n, dueAt, zeroHash],
          account: address,
        }),
        client!.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [stage, setStage] = useState<Stage>("editing");
  const [amountError, setAmountError] = useState<string>();
  const [dateError, setDateError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [sentHash, setSentHash] = useState<Hash>();
  const [created, setCreated] = useState<CreatedInvoice>();
  const [saveState, setSaveState] = useState<SaveState>("saving");

  const busy = stage !== "editing";

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
    setSentHash(undefined);
    setSubmitError(undefined);
    setCreated(undefined);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    const amount = parseUsdtAmount(form.amount);
    const dueAt = dueDateToUnix(form.dueDate);
    setAmountError(
      amount === null ? "Enter an amount above 0, with up to 6 decimals." : undefined,
    );
    setDateError(dueAt === null ? "Choose today or a later date." : undefined);
    setNameError(form.merchantName.trim() ? undefined : "Enter your business name.");
    setSubmitError(undefined);
    setSentHash(undefined);
    if (amount === null || dueAt === null || !form.merchantName.trim()) return;

    const { merchantName, customerName, customerEmail, memo } = form;
    const details = { merchantName, customerName, customerEmail, memo };
    const salt = newSalt();
    const ref = hashInvoiceDetails(details, salt);

    let hash: Hash;
    setStage("wallet");
    try {
      hash = await write.mutateAsync({
        address: REGISTRY_ADDRESS,
        abi: invoiceRegistryAbi,
        functionName: "create",
        args: [amount, dueAt, ref],
        chainId: whitechainSepolia.id,
      });
    } catch (error) {
      if (isUserRejection(error)) {
        setSubmitError("You cancelled in your wallet. Nothing was created.");
      } else if (isInsufficientGas(error)) {
        setSubmitError("This wallet doesn't have enough WBT for gas.");
      } else {
        setSubmitError("The invoice wasn't created. Check your wallet and try again.");
      }
      setStage("editing");
      return;
    }

    setSentHash(hash);
    setStage("confirming");
    try {
      const receipt = await client!.waitForTransactionReceipt({ hash });
      const [log] = parseEventLogs({
        abi: invoiceRegistryAbi,
        eventName: "InvoiceCreated",
        logs: receipt.logs,
      });
      if (receipt.status !== "success" || !log) {
        setSubmitError("The transaction failed, so no invoice was created.");
      } else {
        const invoice = { id: log.args.id, hash, details, salt };
        setCreated(invoice);
        await saveDetails(invoice);
      }
    } catch {
      // The transaction was sent, so asking to retry could create a duplicate.
      setSubmitError(
        "We sent the transaction but couldn't confirm it. Check it on the explorer before trying again.",
      );
    }
    setStage("editing");
  }

  return (
    <WalletGate>
      <div className="grid items-start gap-6 lg:grid-cols-[7fr_5fr]">
        {created ? (
          <CreatedPanel
            id={created.id}
            hash={created.hash}
            saveState={saveState}
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
                    value={form.customerEmail}
                    onChange={(event) => update("customerEmail", event.target.value)}
                  />
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
            </fieldset>
            {fee.data !== undefined && (
              <div className="well flex items-baseline justify-between gap-4 text-[13px]/[18px]">
                <span className="text-muted">Creating this invoice costs you</span>
                <span className="figure">
                  about {Number(formatEther(fee.data)).toFixed(4)} WBT
                </span>
              </div>
            )}
            {submitError && (
              <p role="alert" className="text-[13px]/[18px] text-late">
                {submitError}{" "}
                {sentHash && (
                  <a
                    className="underline"
                    href={explorerTxUrl(sentHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction ↗
                  </a>
                )}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Link href="/dashboard" className="btn">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary min-w-[200px]" disabled={busy}>
                {stage === "wallet" && "Confirm in your wallet"}
                {stage === "confirming" && "Creating invoice…"}
                {stage === "editing" && "Create invoice"}
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
    </WalletGate>
  );
}
