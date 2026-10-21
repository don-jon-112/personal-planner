import { NextRequest, NextResponse } from "next/server";
import {
  getCache,
  setCache,
  getProjectTasksKey,
  getProjectEpicsKey,
  getProjectTimelineKey,
} from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/cache/timeline?projectId=...
 * Retrieves cached timeline tasks & epics from Redis for viewers.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || "_global_";

    const tasksKey = getProjectTasksKey(projectId);
    const epicsKey = getProjectEpicsKey(projectId);

    const [tasks, epics] = await Promise.all([
      getCache<any[]>(tasksKey),
      getCache<any[]>(epicsKey),
    ]);

    if (tasks !== null || epics !== null) {
      return NextResponse.json({
        success: true,
        source: "redis",
        projectId,
        tasks: tasks || [],
        epics: epics || [],
      });
    }

    return NextResponse.json({
      success: true,
      source: "miss",
      projectId,
      tasks: null,
      epics: null,
    });
  } catch (err: any) {
    console.error("[API Cache GET] Error:", err.message);
    return NextResponse.json(
      { success: false, source: "error", error: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/timeline
 * Saves / updates project tasks and/or epics in Redis.
 * Called whenever an editor/admin updates a task or epic in online mode.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId = "_global_", tasks, epics } = body;

    const promises: Promise<any>[] = [];

    if (Array.isArray(tasks)) {
      const tasksKey = getProjectTasksKey(projectId);
      promises.push(setCache(tasksKey, tasks));
    }

    if (Array.isArray(epics)) {
      const epicsKey = getProjectEpicsKey(projectId);
      promises.push(setCache(epicsKey, epics));
    }

    if (Array.isArray(tasks) && Array.isArray(epics)) {
      const combinedKey = getProjectTimelineKey(projectId);
      promises.push(
        setCache(combinedKey, {
          tasks,
          epics,
          cachedAt: new Date().toISOString(),
        })
      );
    }

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      projectId,
      message: "Data cached to Redis successfully",
    });
  } catch (err: any) {
    console.error("[API Cache POST] Error:", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
