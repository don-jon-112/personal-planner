import { NextResponse } from "next/server";
import feApiMap from "@/data/fe-api-map.json";

// The data is generated offline by `npm run fe-api:scan` (scripts/fe-api-scanner) and
// committed with the app, so it is bundled and works on any host, including Vercel.
export async function GET() {
  return NextResponse.json({ map: feApiMap });
}
