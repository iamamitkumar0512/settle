// Makes the agent's wallet. The key goes straight into .env and is never printed.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = fileURLToPath(new URL("../.env", import.meta.url));
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const saved = current.match(/^AGENT_KEY=(0x[0-9a-fA-F]{64})\s*$/m)?.[1];

const key = (saved as `0x${string}` | undefined) ?? generatePrivateKey();
if (!saved) appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}AGENT_KEY=${key}\n`);

console.log(saved ? "The agent already has a wallet:" : "Saved a new wallet in apps/agent/.env:");
console.log(`  ${privateKeyToAccount(key).address}`);
console.log("Send it test USDT from your Settle Account page. It needs no WBT.");
