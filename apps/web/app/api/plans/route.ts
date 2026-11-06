import { connection } from "next/server";
import { readPlanRecords } from "@/lib/server/arkiv";

export const maxDuration = 60;

// Every plan's name and description, by plan id. A plan is a public offer, so this needs no login.
export async function GET() {
  // Read at request time: plans are added while the app runs.
  await connection();
  try {
    return Response.json({ plans: await readPlanRecords() });
  } catch (error) {
    // The name only: messages can contain the keyed RPC URL.
    console.error("Reading plan details failed:", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
