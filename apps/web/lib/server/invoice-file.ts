import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { REGISTRY_ADDRESS } from "@/lib/contracts";

// Saved with each file's record, so a reader knows how the bytes on Swarm are laid out.
export const FILE_ENCRYPTION = "aes-256-gcm; iv(12) || ciphertext || tag(16)";

const IV_BYTES = 12;
const TAG_BYTES = 16;

// Its own key, derived from the data key, so files and invoice details never share one.
function fileKey() {
  const secret = process.env.ARKIV_DATA_KEY;
  if (!secret) throw new Error("ARKIV_DATA_KEY is not configured");
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "hex"), Buffer.alloc(0), "settle-invoice-file-v1", 32),
  );
}

// The invoice is bound in as associated data, so a file copied onto another invoice won't decrypt.
function invoiceTag(invoiceId: bigint) {
  return Buffer.from(`${REGISTRY_ADDRESS.toLowerCase()}:${invoiceId}`);
}

// Swarm is public, so a file is encrypted before it leaves the server. Its size still shows.
export function encryptInvoiceFile(invoiceId: bigint, file: Uint8Array) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", fileKey(), iv);
  cipher.setAAD(invoiceTag(invoiceId));
  const sealed = Buffer.concat([iv, cipher.update(file), cipher.final(), cipher.getAuthTag()]);
  return new Uint8Array(sealed);
}

// Throws when the key is wrong, the bytes were changed, or they belong to another invoice.
export function decryptInvoiceFile(invoiceId: bigint, sealed: Uint8Array) {
  if (sealed.length <= IV_BYTES + TAG_BYTES) throw new Error("Encrypted file is too short");

  const bytes = Buffer.from(sealed);
  const decipher = createDecipheriv("aes-256-gcm", fileKey(), bytes.subarray(0, IV_BYTES));
  decipher.setAAD(invoiceTag(invoiceId));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  const file = Buffer.concat([
    decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
    decipher.final(),
  ]);
  return new Uint8Array(file);
}
