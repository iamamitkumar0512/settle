import "server-only";

const REFERENCE = /^[0-9a-f]{64}$/;
const TIMEOUT_MS = 60_000;

// A Bee node or gateway, and the postage batch that pays for what it stores.
function settings() {
  const url = process.env.SWARM_BEE_URL?.replace(/\/+$/, "");
  const batchId = process.env.SWARM_BATCH_ID;
  return url && batchId ? { url, batchId } : null;
}

export function swarmConfigured() {
  return settings() !== null;
}

// Stores the bytes on Swarm and returns their reference, which is a hash of the content.
export async function uploadToSwarm(data: Uint8Array<ArrayBuffer>) {
  const swarm = settings();
  if (!swarm) throw new Error("Swarm is not configured");

  const response = await fetch(`${swarm.url}/bytes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Swarm-Postage-Batch-Id": swarm.batchId,
    },
    body: data,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Swarm upload failed with status ${response.status}`);

  const { reference } = (await response.json()) as { reference?: unknown };
  if (typeof reference !== "string" || !REFERENCE.test(reference)) {
    throw new Error("Swarm returned no reference");
  }
  return reference;
}

export async function downloadFromSwarm(reference: string) {
  const swarm = settings();
  if (!swarm) throw new Error("Swarm is not configured");
  if (!REFERENCE.test(reference)) throw new Error("Not a Swarm reference");

  const response = await fetch(`${swarm.url}/bytes/${reference}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Swarm download failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
