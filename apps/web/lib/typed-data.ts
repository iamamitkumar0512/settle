import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { whitechainSepolia } from "./chains";
import { REGISTRY_ADDRESS, TRANSFER_ADDRESS, USDT_ADDRESS } from "./contracts";
import type { Invoice } from "./invoice";

// How long a signed request stays valid for the relayer to submit.
const VALID_SECONDS = 30 * 60;

export const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: whitechainSepolia.id,
  verifyingContract: USDT_ADDRESS,
} as const;

export const REGISTRY_DOMAIN = {
  name: "Settle InvoiceRegistry",
  version: "2",
  chainId: whitechainSepolia.id,
  verifyingContract: REGISTRY_ADDRESS,
} as const;

const AUTHORIZATION_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

const RECEIVE_TYPES = { ReceiveWithAuthorization: AUTHORIZATION_FIELDS } as const;

const CREATE_TYPES = {
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

const CANCEL_TYPES = {
  CancelInvoice: [
    { name: "id", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

function expiry() {
  return BigInt(Math.floor(Date.now() / 1000) + VALID_SECONDS);
}

// Must match InvoiceRegistry.authorizationNonce byte for byte.
export function authorizationNonce(id: bigint, payer: Address) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }],
      ["SETTLE_INVOICE", id, payer],
    ),
  );
}

// Must match InvoiceRegistry.refundNonce byte for byte.
export function refundNonce(id: bigint, refundedBefore: bigint) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "uint256" }],
      ["SETTLE_REFUND", id, refundedBefore],
    ),
  );
}

// Must match GaslessTransfer.transferNonce byte for byte.
export function transferNonce(to: Address, fee: bigint, salt: Hex) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      ["SETTLE_TRANSFER", to, fee, salt],
    ),
  );
}

// What a customer signs to pay. Only the registry can use it, for this exact invoice.
export function paymentAuthorization(invoice: Invoice, payer: Address) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: payer,
      to: REGISTRY_ADDRESS,
      value: invoice.amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: authorizationNonce(invoice.id, payer),
    },
  } as const;
}

// What a merchant signs to refund. It works once, for this amount, on this invoice.
export function refundAuthorization(invoice: Invoice, amount: bigint) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: invoice.merchant,
      to: REGISTRY_ADDRESS,
      value: amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: refundNonce(invoice.id, invoice.refunded),
    },
  } as const;
}

export type TransferRequest = {
  from: Address;
  to: Address;
  amount: bigint;
  fee: bigint;
  salt: Hex;
};

// What an account signs to send its USDT without gas. Only the transfer contract can use it, and
// only for this recipient and this fee.
export function withdrawAuthorization(request: TransferRequest) {
  return {
    domain: USDT_DOMAIN,
    types: RECEIVE_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: request.from,
      to: TRANSFER_ADDRESS,
      value: request.amount,
      validAfter: 0n,
      validBefore: expiry(),
      nonce: transferNonce(request.to, request.fee, request.salt),
    },
  } as const;
}

export type CreateRequest = {
  merchant: Address;
  amount: bigint;
  dueAt: bigint;
  ref: Hex;
  relayFee: bigint;
  salt: Hex;
  deadline: bigint;
};

// What a merchant signs to create an invoice without gas.
export function createInvoiceRequest(fields: Omit<CreateRequest, "deadline">) {
  return {
    domain: REGISTRY_DOMAIN,
    types: CREATE_TYPES,
    primaryType: "CreateInvoice",
    message: { ...fields, deadline: expiry() },
  } as const;
}

// What a merchant signs to cancel an open invoice without gas.
export function cancelInvoiceRequest(id: bigint) {
  return {
    domain: REGISTRY_DOMAIN,
    types: CANCEL_TYPES,
    primaryType: "CancelInvoice",
    message: { id, deadline: expiry() },
  } as const;
}
