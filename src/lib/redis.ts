import Redis from "ioredis";

// Cache Keys prefix
export const CACHE_PREFIX = "planner:";

export function getProjectTasksKey(projectId: string): string {
  return `${CACHE_PREFIX}tasks:${projectId || "_global_"}`;
}

export function getProjectEpicsKey(projectId: string): string {
  return `${CACHE_PREFIX}epics:${projectId || "_global_"}`;
}

export function getProjectTimelineKey(projectId: string): string {
  return `${CACHE_PREFIX}timeline:${projectId || "_global_"}`;
}

export const ASSIGNMENT_LOGS_CACHE_KEY = `${CACHE_PREFIX}assignment-logs`;

export function getAssignmentLogsKey(): string {
  return ASSIGNMENT_LOGS_CACHE_KEY;
}

// Global cached instances across hot-reloads in development / serverless invocation
let globalRedisPrimary: Redis | null = null;
let globalRedisSecondary: Redis | null = null;

function createRedisInstance(rawUrl: string, label: string): Redis | null {
  if (!rawUrl || !rawUrl.trim()) return null;

  try {
    let url = rawUrl.trim();
    // Strip surrounding quotes if present
    url = url.replace(/^["']+|["']+$/g, "").trim();

    // If user pasted a command line like "redis-cli --tls -u redis://..."
    const uriMatch = url.match(/(rediss?:\/\/[^\s"']+)/);
    if (uriMatch) {
      url = uriMatch[1];
    }

    // Normalize url if user passed 'redis://' for an Upstash or TLS endpoint
    const isUpstash = url.includes("upstash.io");
    if (isUpstash && url.startsWith("redis://")) {
      url = url.replace("redis://", "rediss://");
    }

    const isTls = url.startsWith("rediss://") || isUpstash;
    let servername: string | undefined = undefined;

    if (isTls) {
      try {
        const parsed = new URL(url);
        servername = parsed.hostname;
      } catch (_) {}
    }

    const client = new Redis(url, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      tls: isTls
        ? {
            servername,
            rejectUnauthorized: false,
          }
        : undefined,
    });

    client.on("error", (err) => {
      console.warn(`[Redis ${label}] Connection warning/error:`, err.message);
    });

    return client;
  } catch (err: any) {
    console.error(`[Redis ${label}] Initialization error:`, err.message);
    return null;
  }
}

export function getRedisClient(): Redis | null {
  if (!globalRedisPrimary && process.env.REDIS_URL) {
    globalRedisPrimary = createRedisInstance(process.env.REDIS_URL, "Primary");
  }
  return globalRedisPrimary;
}

export function getRedisClientSecondary(): Redis | null {
  if (!globalRedisSecondary && process.env.REDIS_URL_2) {
    globalRedisSecondary = createRedisInstance(process.env.REDIS_URL_2, "Secondary (Backup)");
  }
  return globalRedisSecondary;
}

export function getAllRedisClients(): { primary: Redis | null; secondary: Redis | null } {
  return {
    primary: getRedisClient(),
    secondary: getRedisClientSecondary(),
  };
}

/**
 * Get cached data by key with automatic failover to secondary Redis.
 * If Primary Redis is down, rate-limited, or returns error/miss, Secondary is queried.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const { primary, secondary } = getAllRedisClients();

  // 1. Try Primary Redis
  if (primary) {
    try {
      if (primary.status === "wait") {
        await primary.connect();
      }
      const val = await primary.get(key);
      if (val) {
        return JSON.parse(val) as T;
      }
    } catch (err: any) {
      console.warn(`[Redis Primary] Failed on key "${key}" (${err.message}), falling back to Secondary Redis...`);
    }
  }

  // 2. Failover to Secondary Redis (Upstash Backup)
  if (secondary) {
    try {
      if (secondary.status === "wait") {
        await secondary.connect();
      }
      const val = await secondary.get(key);
      if (val) {
        console.log(`[Redis Failover] Hit key "${key}" on Secondary Redis backup!`);
        return JSON.parse(val) as T;
      }
    } catch (err: any) {
      console.warn(`[Redis Secondary] Failed on key "${key}":`, err.message);
    }
  }

  return null;
}

/**
 * Set cached data with optional TTL (default 7 days).
 * Dual-write: updates BOTH Primary and Secondary Redis so backup is always fresh.
 */
export async function setCache(
  key: string,
  data: any,
  ttlSeconds = 7 * 24 * 60 * 60
): Promise<boolean> {
  const { primary, secondary } = getAllRedisClients();
  const clients = [primary, secondary].filter(Boolean) as Redis[];

  if (clients.length === 0) return false;

  const serialized = JSON.stringify(data);

  const results = await Promise.allSettled(
    clients.map(async (client, idx) => {
      const label = idx === 0 ? "Primary" : "Secondary";
      try {
        if (client.status === "wait") {
          await client.connect();
        }
        if (ttlSeconds > 0) {
          await client.set(key, serialized, "EX", ttlSeconds);
        } else {
          await client.set(key, serialized);
        }
        return true;
      } catch (err: any) {
        console.warn(`[Redis ${label}] setCache error for key "${key}":`, err.message);
        throw err;
      }
    })
  );

  // Success if at least one client successfully wrote
  return results.some((r) => r.status === "fulfilled");
}

/**
 * Delete one or more keys from cache across both Primary and Secondary Redis.
 */
export async function deleteCache(keys: string | string[]): Promise<boolean> {
  const { primary, secondary } = getAllRedisClients();
  const clients = [primary, secondary].filter(Boolean) as Redis[];

  if (clients.length === 0) return false;

  const keyList = Array.isArray(keys) ? keys : [keys];
  if (keyList.length === 0) return true;

  const results = await Promise.allSettled(
    clients.map(async (client) => {
      if (client.status === "wait") {
        await client.connect();
      }
      return client.del(...keyList);
    })
  );

  return results.some((r) => r.status === "fulfilled");
}

/**
 * Health check for both instances
 */
export async function pingAllRedis(): Promise<{
  primary: { configured: boolean; connected: boolean; message: string };
  secondary: { configured: boolean; connected: boolean; message: string };
  connected: boolean;
}> {
  const { primary, secondary } = getAllRedisClients();
  const hasPrimaryEnv = Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
  const hasSecondaryEnv = Boolean(process.env.REDIS_URL_2 && process.env.REDIS_URL_2.trim());

  const pingClient = async (client: Redis | null, name: string, hasEnv: boolean) => {
    if (!hasEnv) {
      return {
        configured: false,
        connected: false,
        message: `${name} belum disetel di environment variable.`,
      };
    }
    if (!client) {
      return {
        configured: true,
        connected: false,
        message: `${name} terkonfigurasi tetapi gagal diinisialisasi (periksa URL).`,
      };
    }
    try {
      if (client.status === "wait") {
        await client.connect();
      }
      const pong = await client.ping();
      return {
        configured: true,
        connected: pong === "PONG",
        message: `${name} active (${pong}).`,
      };
    } catch (err: any) {
      return {
        configured: true,
        connected: false,
        message: `${name} error: ${err.message || "Failed to reach"}`,
      };
    }
  };

  const [pResult, sResult] = await Promise.all([
    pingClient(primary, "Primary Redis (Layerbase)", hasPrimaryEnv),
    pingClient(secondary, "Backup Redis (Upstash)", hasSecondaryEnv),
  ]);

  return {
    primary: pResult,
    secondary: sResult,
    connected: pResult.connected || sResult.connected,
  };
}
