import { NextRequest, NextResponse } from "next/server";
import {
  getCache,
  setCache,
  getProjectTasksKey,
  getProjectEpicsKey,
  getProjectPicsKey,
  getProjectStatusesKey,
  getProjectTimelineKey,
} from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/cache/timeline?projectId=...
 * Retrieves cached timeline tasks, epics, pics, & statuses from Redis.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || "_global_";

    const tasksKey = getProjectTasksKey(projectId);
    const epicsKey = getProjectEpicsKey(projectId);
    const picsKey = getProjectPicsKey(projectId);
    const statusesKey = getProjectStatusesKey(projectId);

    const [tasks, epics, pics, statuses] = await Promise.all([
      getCache<any[]>(tasksKey),
      getCache<any[]>(epicsKey),
      getCache<any[]>(picsKey),
      getCache<any[]>(statusesKey),
    ]);

    if (tasks !== null || epics !== null || pics !== null || statuses !== null) {
      return NextResponse.json({
        success: true,
        source: "redis",
        projectId,
        tasks: tasks || [],
        epics: epics || [],
        pics: pics || [],
        statuses: statuses || [],
      });
    }

    return NextResponse.json({
      success: true,
      source: "miss",
      projectId,
      tasks: null,
      epics: null,
      pics: null,
      statuses: null,
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
 * Saves / updates project tasks, epics, pics, and/or statuses in Redis.
 * Called whenever an editor/admin updates project data in online mode.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId = "_global_", tasks, epics, pics, statuses } = body;

    const promises: Promise<any>[] = [];

    if (Array.isArray(tasks)) {
      const tasksKey = getProjectTasksKey(projectId);
      promises.push(setCache(tasksKey, tasks));
    }

    if (Array.isArray(epics)) {
      const epicsKey = getProjectEpicsKey(projectId);
      promises.push(setCache(epicsKey, epics));
    }

    if (Array.isArray(pics)) {
      const picsKey = getProjectPicsKey(projectId);
      promises.push(setCache(picsKey, pics));
    }

    if (Array.isArray(statuses)) {
      const statusesKey = getProjectStatusesKey(projectId);
      promises.push(setCache(statusesKey, statuses));
    }

    const combinedKey = getProjectTimelineKey(projectId);
    promises.push(
      setCache(combinedKey, {
        tasks: Array.isArray(tasks) ? tasks : undefined,
        epics: Array.isArray(epics) ? epics : undefined,
        pics: Array.isArray(pics) ? pics : undefined,
        statuses: Array.isArray(statuses) ? statuses : undefined,
        cachedAt: new Date().toISOString(),
      })
    );

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
