import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const MAP_FILE = path.join(process.cwd(), "data", "fe-api-map.json");

// GET: the latest scan result produced by scripts/fe-api-scanner (run `npm run fe-api:sync`).
export async function GET() {
  try {
    const raw = await fs.readFile(MAP_FILE, "utf8");
    return NextResponse.json({
      syncEnabled: process.env.FE_API_SYNC_ENABLED === "true",
      map: JSON.parse(raw),
    });
  } catch {
    return NextResponse.json({
      syncEnabled: process.env.FE_API_SYNC_ENABLED === "true",
      map: null,
      message: "No scan yet. Run `npm run fe-api:sync` (or use the Sync button when enabled).",
    });
  }
}

// POST: fetch the FE repo and rescan if its branch moved.
// Disabled unless FE_API_SYNC_ENABLED=true, because it runs git on the host machine
// (works for local / self-hosted use, not on serverless hosting such as Vercel).
export async function POST() {
  if (process.env.FE_API_SYNC_ENABLED !== "true") {
    return NextResponse.json({ ok: false, message: "Sync is disabled on this server (FE_API_SYNC_ENABLED is not true)." }, { status: 403 });
  }

  const script = path.join(process.cwd(), "scripts", "fe-api-scanner", "sync.mjs");
  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: process.cwd() });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => resolve({ code: -1, output: String(e) }));
    child.on("close", (code) => resolve({ code, output }));
  });

  const lines = result.output.split(/\r?\n/).filter((l) => l.startsWith("[fe-sync]"));
  return NextResponse.json(
    { ok: result.code === 0, message: lines.join("\n") || result.output.slice(-500) },
    { status: result.code === 0 ? 200 : 500 }
  );
}
