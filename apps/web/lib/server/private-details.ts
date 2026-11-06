import "server-only";
import { CONTENT_TYPE, decryptBytes, encryptBytes, importKey } from "arkiv-encryption";

// The salt stays private too: with a public salt, anyone could test guessed emails against ref.
export type PrivateDetails = {
  customerName: string;
  customerEmail: string;
  customerWallet: string;
  // A store's own order number. Only its merchant reads it back.
  receipt?: string;
  salt: string;
};

// Arkiv is public and AES-GCM reveals plaintext length, so pad to hide how long a name or email is.
const PADDED_BLOCK_BYTES = 512;

async function dataKey() {
  const secret = process.env.ARKIV_DATA_KEY;
  if (!secret) throw new Error("ARKIV_DATA_KEY is not configured");
  return importKey(secret);
}

function pad(json: string) {
  const size = new TextEncoder().encode(json).length;
  const padded = Math.ceil((size + 1) / PADDED_BLOCK_BYTES) * PADDED_BLOCK_BYTES;
  return json + " ".repeat(padded - size);
}

// Where a merchant's webhooks go, and the secret that signs them.
export type WebhookDetails = {
  url: string;
  secret: string;
};

// The merchant is inside the ciphertext, so an envelope copied to another merchant won't decrypt.
export async function encryptWebhookDetails(merchant: string, details: WebhookDetails) {
  const plaintext = JSON.stringify({ merchant: merchant.toLowerCase(), ...details });
  return {
    envelope: await encryptBytes(await dataKey(), pad(plaintext)),
    mediaType: CONTENT_TYPE,
  };
}

// Throws a fixed error on any failure, and never quotes the decrypted text.
export async function decryptWebhookDetails(
  merchant: string,
  envelope: Uint8Array,
  mediaType: string,
): Promise<WebhookDetails> {
  if (mediaType !== CONTENT_TYPE) throw new Error("Unsupported encrypted data");

  const bytes = await decryptBytes(await dataKey(), envelope);
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<
    string,
    unknown
  >;
  const { merchant: owner, url, secret } = value;
  if (owner !== merchant.toLowerCase() || typeof url !== "string" || typeof secret !== "string") {
    throw new Error("Encrypted data is not valid for this merchant");
  }
  return { url, secret };
}

// The invoice id is inside the ciphertext, so an envelope copied onto another invoice won't decrypt.
export async function encryptPrivateDetails(invoiceId: bigint, details: PrivateDetails) {
  const { customerName, customerEmail, customerWallet, receipt, salt } = details;
  const plaintext = JSON.stringify({
    invoiceId: String(invoiceId),
    customerName,
    customerEmail,
    customerWallet,
    ...(receipt ? { receipt } : {}),
    salt,
  });
  return {
    envelope: await encryptBytes(await dataKey(), pad(plaintext)),
    mediaType: CONTENT_TYPE,
  };
}

// Throws a fixed error on any failure, and never quotes the decrypted text.
export async function decryptPrivateDetails(
  invoiceId: bigint,
  envelope: Uint8Array,
  mediaType: string,
): Promise<PrivateDetails> {
  if (mediaType !== CONTENT_TYPE) throw new Error("Unsupported encrypted data");

  const bytes = await decryptBytes(await dataKey(), envelope);
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof value === "object" && value !== null) {
      const { invoiceId: id, customerName, customerEmail, salt } = value as Record<string, unknown>;
      // Records from before invoices could be sent to a wallet have no wallet field.
      const customerWallet = (value as Record<string, unknown>).customerWallet ?? "";
      const { receipt } = value as Record<string, unknown>;
      if (
        id === String(invoiceId) &&
        typeof customerName === "string" &&
        typeof customerEmail === "string" &&
        typeof customerWallet === "string" &&
        typeof salt === "string"
      ) {
        return {
          customerName,
          customerEmail,
          customerWallet,
          ...(typeof receipt === "string" ? { receipt } : {}),
          salt,
        };
      }
    }
  } catch {
    // Falls through to the fixed error below.
  }
  throw new Error("Encrypted data is not valid for this invoice");
}
