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
      const cleaned = logs.filter(
        (l) => !(l.taskName || "").includes("Migrate API Auto2000BodyPaintController getBodyPaintDetails")
      );
      return NextResponse.json({
        success: true,
        source: "redis",
        logs: cleaned,
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

    const cleaned = logs.filter(
      (l) => !(l.taskName || "").includes("Migrate API Auto2000BodyPaintController getBodyPaintDetails")
    );

    const key = getAssignmentLogsKey();
    await setCache(key, cleaned, 7 * 24 * 60 * 60);

    return NextResponse.json({
      success: true,
      count: cleaned.length,
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

/**
 * DELETE /api/cache/assignment-logs
 * Removes a specific log by id or taskName from Redis cache.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const taskName = searchParams.get("taskName");

    const key = getAssignmentLogsKey();
    const logs = await getCache<any[]>(key);

    if (Array.isArray(logs)) {
      const filtered = logs.filter((l) => {
        if (id && l.id === id) return false;
        if (taskName && (l.taskName || "").includes(taskName)) return false;
        if ((l.taskName || "").includes("Migrate API Auto2000BodyPaintController getBodyPaintDetails")) return false;
        return true;
      });
      await setCache(key, filtered, 7 * 24 * 60 * 60);
      return NextResponse.json({
        success: true,
        count: filtered.length,
        message: "Log removed from Redis cache",
      });
    }

    return NextResponse.json({ success: true, message: "Cache was empty" });
  } catch (err: any) {
    console.error("[API Cache Assignment-Logs DELETE] Error:", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
