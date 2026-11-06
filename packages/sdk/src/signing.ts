import {
  bytesToHex,
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  parseSignature,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

// Everything here has to match the contracts byte for byte. Settle's own app signs the same
// messages, so a request built here is indistinguishable from one made in its dashboard.

// How long a signed request stays valid for Settle's relayer to submit.
const VALID_SECONDS = 30 * 60;

export function expiry() {
  return BigInt(Math.floor(Date.now() / 1000) + VALID_SECONDS);
}

export function randomBytes32(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function usdtDomain(chainId: number, usdt: Address) {
  return { name: "Tether USD", version: "1", chainId, verifyingContract: usdt } as const;
}

export function registryDomain(chainId: number, registry: Address) {
  return {
    name: "Settle InvoiceRegistry",
    version: "2",
    chainId,
    verifyingContract: registry,
  } as const;
}

// USDT's EIP-3009 authorization. Only the address in `to` can use it.
export const RECEIVE_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const CREATE_TYPES = {
  CreateInvoice: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "dueAt", type: "uint64" },
    { name: "ref", type: "bytes32" },
    { name: "relayFee", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const CANCEL_TYPES = {
  CancelInvoice: [
    { name: "id", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// InvoiceRegistry.authorizationNonce: ties a payment signature to one invoice and one payer.
export function authorizationNonce(id: bigint, payer: Address) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }],
      ["SETTLE_INVOICE", id, payer],
    ),
  );
}

// InvoiceRegistry.refundNonce: ties a refund signature to one invoice at one refunded total.
export function refundNonce(id: bigint, refundedBefore: bigint) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "uint256" }],
      ["SETTLE_REFUND", id, refundedBefore],
    ),
  );
}

// GaslessTransfer.transferNonce: ties a transfer signature to one recipient and one fee.
export function transferNonce(to: Address, fee: bigint, salt: Hex) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      ["SETTLE_TRANSFER", to, fee, salt],
    ),
  );
}

export type InvoiceDetails = {
  merchantName: string;
  customerName: string;
  customerEmail: string;
  customerWallet: string;
  memo: string;
  /** The store's own order number. */
  receipt?: string;
  /** Where the store wants its customer sent after paying. */
  callbackUrl?: string;
};

// An invoice goes to an email address or to a wallet address. The other field stays empty.
export function parseCustomer(text: string) {
  const value = text.trim();
  if (isAddress(value, { strict: false })) {
    return { customerEmail: "", customerWallet: getAddress(value) as string };
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? { customerEmail: value, customerWallet: "" }
    : null;
}

// The invoice's on-chain `ref`. It commits to the details without revealing them.
export function hashInvoiceDetails(details: InvoiceDetails, salt: Hex): Hex {
  const { merchantName, customerName, customerEmail, customerWallet, memo } = details;
  const customer = customerWallet ? { customerEmail, customerWallet } : { customerEmail };
  // A field joins the hash only when it is set, so the merchant's signature covers it.
  const order = {
    ...(details.receipt ? { receipt: details.receipt } : {}),
    ...(details.callbackUrl ? { callbackUrl: details.callbackUrl } : {}),
  };
  return keccak256(
    stringToHex(JSON.stringify({ merchantName, customerName, ...customer, memo, ...order, salt })),
  );
}

// The contracts and USDT take a signature as its three parts.
export function splitSignature(signature: Hex) {
  const { r, s, v, yParity } = parseSignature(signature);
  return { v: Number(v ?? BigInt(yParity + 27)), r, s };
}
