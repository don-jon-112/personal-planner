import { NextRequest, NextResponse } from "next/server";
import { setCache, getProjectTasksKey, getProjectEpicsKey, getProjectTimelineKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * POST /api/cache/sync-all
 * Caches all projects' tasks and epics to Redis in bulk.
 * Called when admin clicks Sync to Firebase in settings.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectsData } = body as {
      projectsData: Record<string, { tasks: any[]; epics: any[] }>;
    };

    if (!projectsData || typeof projectsData !== "object") {
      return NextResponse.json(
        { success: false, message: "Invalid projectsData format" },
        { status: 400 }
      );
    }

    const promises: Promise<any>[] = [];
    let projectCount = 0;

    for (const [projectId, data] of Object.entries(projectsData)) {
      if (Array.isArray(data.tasks)) {
        promises.push(setCache(getProjectTasksKey(projectId), data.tasks));
      }
      if (Array.isArray(data.epics)) {
        promises.push(setCache(getProjectEpicsKey(projectId), data.epics));
      }
      if (Array.isArray(data.tasks) && Array.isArray(data.epics)) {
        promises.push(
          setCache(getProjectTimelineKey(projectId), {
            tasks: data.tasks,
            epics: data.epics,
            cachedAt: new Date().toISOString(),
          })
        );
      }
      projectCount++;
    }

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      syncedProjects: projectCount,
      message: `Successfully synced ${projectCount} project(s) to Redis cache`,
    });
  } catch (err: any) {
    console.error("[API Cache Sync-All] Error:", err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
