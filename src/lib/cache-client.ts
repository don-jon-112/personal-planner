/**
 * Client-side caching utilities to communicate with Redis cache endpoints
 */

export async function fetchCachedTimelineData(projectId: string): Promise<{
  source: "redis" | "miss";
  tasks: any[] | null;
  epics: any[] | null;
}> {
  try {
    const res = await fetch(`/api/cache/timeline?projectId=${encodeURIComponent(projectId || "_global_")}`);
    if (!res.ok) {
      return { source: "miss", tasks: null, epics: null };
    }
    const data = await res.json();
    if (data.source === "redis" && (Array.isArray(data.tasks) || Array.isArray(data.epics))) {
      return {
        source: "redis",
        tasks: data.tasks || [],
        epics: data.epics || [],
      };
    }
    return { source: "miss", tasks: null, epics: null };
  } catch (err) {
    console.warn("[CacheClient] Failed to fetch cached timeline from Redis:", err);
    return { source: "miss", tasks: null, epics: null };
  }
}

export async function saveProjectCacheToRedis(
  projectId: string,
  payload: { tasks?: any[]; epics?: any[] }
): Promise<boolean> {
  // Only sync when online
  if (typeof window !== "undefined") {
    if (!navigator.onLine || localStorage.getItem("syncMode") === "local") {
      return false;
    }
  }

  try {
    const res = await fetch("/api/cache/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: projectId || "_global_",
        ...payload,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[CacheClient] Failed to save cache to Redis:", err);
    return false;
  }
}

export async function syncAllProjectsCacheToRedis(
  projectsData: Record<string, { tasks: any[]; epics: any[] }>
): Promise<boolean> {
  try {
    const res = await fetch("/api/cache/sync-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectsData }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[CacheClient] Failed to bulk sync cache to Redis:", err);
    return false;
  }
}

export async function fetchCachedAssignmentLogs(): Promise<{
  source: "redis" | "miss";
  logs: any[] | null;
}> {
  try {
    const res = await fetch("/api/cache/assignment-logs");
    if (!res.ok) {
      return { source: "miss", logs: null };
    }
    const data = await res.json();
    if (data.source === "redis" && Array.isArray(data.logs)) {
      return {
        source: "redis",
        logs: data.logs,
      };
    }
    return { source: "miss", logs: null };
  } catch (err) {
    console.warn("[CacheClient] Failed to fetch cached assignment logs from Redis:", err);
    return { source: "miss", logs: null };
  }
}

export async function saveAssignmentLogsToRedis(logs: any[]): Promise<boolean> {
  if (typeof window !== "undefined") {
    if (!navigator.onLine || localStorage.getItem("syncMode") === "local") {
      return false;
    }
  }

  try {
    const res = await fetch("/api/cache/assignment-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[CacheClient] Failed to save assignment logs to Redis:", err);
    return false;
  }
}

export async function appendAssignmentLogToRedis(log: any): Promise<boolean> {
  if (typeof window !== "undefined") {
    if (!navigator.onLine || localStorage.getItem("syncMode") === "local") {
      return false;
    }
  }

  try {
    const res = await fetch("/api/cache/assignment-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ log }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[CacheClient] Failed to append assignment log to Redis:", err);
    return false;
  }
}

export interface RedisHealthStatus {
  connected: boolean;
  primary?: { configured: boolean; connected: boolean; message: string };
  secondary?: { configured: boolean; connected: boolean; message: string };
}

export async function checkRedisStatus(): Promise<RedisHealthStatus> {
  try {
    const res = await fetch("/api/cache/status");
    return await res.json();
  } catch (err: any) {
    return {
      connected: false,
      primary: { configured: false, connected: false, message: err.message || "Failed to reach cache status endpoint" },
      secondary: { configured: false, connected: false, message: err.message || "Failed to reach cache status endpoint" },
    };
  }
}
