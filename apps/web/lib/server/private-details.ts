import "server-only";
import { CONTENT_TYPE, decryptBytes, encryptBytes, importKey } from "arkiv-encryption";

// The salt stays private too: with a public salt, anyone could test guessed emails against ref.
export type PrivateDetails = {
  customerName: string;
  customerEmail: string;
  customerWallet: string;
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

// The invoice id is inside the ciphertext, so an envelope copied onto another invoice won't decrypt.
export async function encryptPrivateDetails(invoiceId: bigint, details: PrivateDetails) {
  const { customerName, customerEmail, customerWallet, salt } = details;
  const plaintext = JSON.stringify({
    invoiceId: String(invoiceId),
    customerName,
    customerEmail,
    customerWallet,
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
      if (
        id === String(invoiceId) &&
        typeof customerName === "string" &&
        typeof customerEmail === "string" &&
        typeof customerWallet === "string" &&
        typeof salt === "string"
      ) {
        return { customerName, customerEmail, customerWallet, salt };
      }
    }
  } catch {
    // Falls through to the fixed error below.
  }
  throw new Error("Encrypted data is not valid for this invoice");
}
