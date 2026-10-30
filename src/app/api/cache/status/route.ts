import { NextRequest, NextResponse } from "next/server";
import { pingAllRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/cache/status
 * Health check endpoint for configured Primary & Secondary Redis connections.
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

/**
 * POST /api/cache/status
 * Test connection to custom Primary and/or Secondary Redis URLs.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { primaryUrl, secondaryUrl } = body;
    const status = await pingAllRedis(primaryUrl, secondaryUrl);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      primary: { configured: false, connected: false, message: err.message },
      secondary: { configured: false, connected: false, message: err.message },
    });
  }
}
