import { NextResponse } from "next/server";
import { pingAllRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/cache/status
 * Health check endpoint for Primary & Secondary Redis connections.
 */
export async function GET() {
  try {
    const status = await pingAllRedis();
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      primary: { configured: false, connected: false, message: err.message },
      secondary: { configured: false, connected: false, message: err.message },
    });
  }
}
