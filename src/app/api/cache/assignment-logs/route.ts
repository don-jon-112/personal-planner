import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, getAssignmentLogsKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/cache/assignment-logs
 * Retrieves cached assignment logs from Redis.
 */
export async function GET() {
  try {
    const key = getAssignmentLogsKey();
    const logs = await getCache<any[]>(key);

    if (Array.isArray(logs)) {
      return NextResponse.json({
        success: true,
        source: "redis",
        logs,
      });
    }

    return NextResponse.json({
      success: true,
      source: "miss",
      logs: null,
    });
  } catch (err: any) {
    console.error("[API Cache Assignment-Logs GET] Error:", err.message);
    return NextResponse.json(
      { success: false, source: "error", error: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/assignment-logs
 * Saves / updates assignment logs in Redis cache.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { logs } = body;

    if (!Array.isArray(logs)) {
      return NextResponse.json(
        { success: false, error: "logs must be an array" },
        { status: 400 }
      );
    }

    const key = getAssignmentLogsKey();
    await setCache(key, logs, 7 * 24 * 60 * 60);

    return NextResponse.json({
      success: true,
      count: logs.length,
      message: "Assignment logs cached to Redis successfully",
    });
  } catch (err: any) {
    console.error("[API Cache Assignment-Logs POST] Error:", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
