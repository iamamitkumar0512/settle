import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  parseUnits,
  type Abi,
  type Address,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { whitechainSepolia } from "@/lib/chains";
import { registry } from "@/lib/contracts";
import { toInvoice } from "@/lib/invoice";
import { allow, DAY } from "./rate-limit";

export const MIN_INVOICE = parseUnits(process.env.MIN_INVOICE_USDT ?? "1", 6);
const MAX_FEE_PER_GAS = parseGwei(process.env.RELAYER_MAX_FEE_GWEI ?? "50");
const MIN_BALANCE = parseEther(process.env.RELAYER_MIN_WBT ?? "0.005");
// Creating, refunding, cancelling and closing earn no fee, so they share a daily budget.
const FREE_RELAYS_PER_DAY = Number(process.env.RELAYER_FREE_PER_DAY ?? "500");

export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export const chainClient = createPublicClient({
  chain: whitechainSepolia,
  transport: http(process.env.RPC_ENDPOINT),
});

export function relayerAccount() {
  const key = process.env.RELAYER_PK;
  if (!key) throw new RelayError(503, "relayer_not_configured");
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

export async function relayerStatus() {
  const { address } = relayerAccount();
  const balance = await chainClient.getBalance({ address });
  return { address, balance, ok: balance >= MIN_BALANCE };
}

export async function readInvoice(id: bigint) {
  const row = await chainClient.readContract({
    address: registry.address,
    abi: registry.abi,
    functionName: "invoices",
    args: [id],
  });
  const invoice = toInvoice(id, row);
  if (invoice.merchant === "0x0000000000000000000000000000000000000000") {
    throw new RelayError(404, "InvoiceNotFound");
  }
  return { invoice, ref: row[7] };
}

// Spends from the shared budget for relays that earn no fee, and from the account's own cap.
export function spendFreeRelay(kind: string, account: Address, perDay: number) {
  if (!allow(`${kind}:${account.toLowerCase()}`, perDay, DAY)) {
    throw new RelayError(429, "daily_limit_reached");
  }
  if (!allow("free-relays", FREE_RELAYS_PER_DAY, DAY)) {
    throw new RelayError(503, "relayer_budget_spent");
  }
}

function revertReason(error: unknown) {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  // String reverts (the token's) carry a reason; custom errors (the registry's) carry a name.
  return reverted.reason ?? reverted.data?.errorName;
}

type RelayCall = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

// One wallet has one nonce sequence, so sends in this process go one at a time.
let lastSend: Promise<unknown> = Promise.resolve();

export function relay(call: RelayCall) {
  const next = lastSend.then(
    () => send(call),
    () => send(call),
  );
  lastSend = next.catch(() => undefined);
  return next;
}

const NONCE_RETRIES = 3;

// The queue above covers one copy of the server. Another copy can pick the same nonce, and then
// the later transaction is refused. Sending again picks up the next one. Nothing was spent.
async function retryOnNonceClash(write: () => Promise<Hash>) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      const text = error instanceof Error ? error.message.toLowerCase() : "";
      const isClash = /nonce|replacement transaction underpriced|already known/.test(text);
      if (!isClash || attempt >= NONCE_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

// Everything that can stop a transaction before it is sent. It sends nothing.
export async function prepareRelay(call: RelayCall) {
  const account = relayerAccount();
  const [balance, fees] = await Promise.all([
    chainClient.getBalance({ address: account.address }),
    chainClient.estimateFeesPerGas(),
  ]);
  if (balance < MIN_BALANCE) throw new RelayError(503, "relayer_low_balance");
  if (fees.maxFeePerGas > MAX_FEE_PER_GAS) throw new RelayError(503, "gas_price_too_high");

  let gas: bigint;
  try {
    // A call that would revert fails here and costs nothing, so a bad or reused signature never
    // spends the relayer's WBT.
    gas = await chainClient.estimateContractGas({ ...call, account });
  } catch (error) {
    throw new RelayError(400, revertReason(error) ?? "simulation_failed");
  }
  return { account, fees, gas };
}

async function send(call: RelayCall): Promise<{ hash: Hash; receipt: TransactionReceipt }> {
  const { account, fees, gas } = await prepareRelay(call);
  const wallet = createWalletClient({
    account,
    chain: whitechainSepolia,
    transport: http(process.env.RPC_ENDPOINT),
  });
  const hash = await retryOnNonceClash(() =>
    wallet.writeContract({
      ...call,
      gas: (gas * 12n) / 10n,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    }),
  );
  const receipt = await chainClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new RelayError(502, "transaction_reverted");
  return { hash, receipt };
}
