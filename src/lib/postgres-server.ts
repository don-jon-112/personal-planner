import postgres from 'postgres';

// Client connection pool map cached by connection URL to prevent connection exhaustion
const clientPool = new Map<string, postgres.Sql>();

// 15 Dedicated Tables mapping
export const COLLECTION_TABLE_MAP: Record<string, string> = {
  projects: 'projects',
  timelineEpics: 'timeline_epics',
  timelineTasks: 'timeline_tasks',
  timelinePics: 'timeline_pics',
  timelineStatuses: 'timeline_statuses',
  timelineHolidays: 'timeline_holidays',
  notes: 'notes',
  bugReports: 'bug_reports',
  weeklyReports: 'weekly_reports',
  secretKeys: 'secret_keys',
  todos: 'todos',
  users: 'users',
  roles: 'roles',
  assignmentLogs: 'assignment_logs',
  appSettings: 'app_settings',
};

export function getTableName(collectionName: string): string {
  return COLLECTION_TABLE_MAP[collectionName] || collectionName.toLowerCase();
}

// Normalize Supabase & PostgreSQL Connection String:
// Supabase pooler on port 5432 is "Session Mode" which has a strict limit of 15 connections (EMAXCONNSESSION).
// Switching to port 6543 activates "Transaction Mode", which is designed for Serverless (Vercel/Next.js)
// and supports thousands of pooled connections without connection exhaustion.
export function normalizePostgresUrl(url: string): string {
  let clean = url.trim();
  if (clean.includes('.pooler.supabase.com:5432')) {
    clean = clean.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }
  return clean;
}

export function getPostgresSql(customUrl?: string): postgres.Sql {
  const rawUrl = customUrl || process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const url = normalizePostgresUrl(rawUrl);

  if (clientPool.has(url)) {
    return clientPool.get(url)!;
  }

  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const sql = postgres(url, {
    ssl: isLocal ? false : 'require',
    max: 1, // Single connection per serverless function to prevent pool exhaustion in Supabase / PgBouncer
    idle_timeout: 5,
    connect_timeout: 15,
    prepare: false, // Critical for Supabase Transaction Pooler (port 6543 / PgBouncer)
  });

  clientPool.set(url, sql);
  return sql;
}

// 1. Ensure Table Schema Exists for a Specific Table
export async function ensureTableExists(sql: postgres.Sql, tableName: string): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "idx_${tableName}_project" ON "${tableName}"(project_id);
    CREATE INDEX IF NOT EXISTS "idx_${tableName}_updated" ON "${tableName}"(updated_at DESC);
  `);
}

// 2. Ensure All 15 Dedicated Tables Exist in Target Database (Auto-Migration)
export async function ensureAllTables(sql: postgres.Sql): Promise<void> {
  const tables = Object.values(COLLECTION_TABLE_MAP);
  for (const table of tables) {
    await ensureTableExists(sql, table);
  }
}

// 3. Test Connection, Auto-Ensure All Tables, and Count Total Rows Across Tables
export async function testPostgresConnection(connectionString: string): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!connectionString || !connectionString.trim()) {
      return { success: false, error: 'Connection string PostgreSQL wajib diisi.' };
    }
    const cleanUrl = connectionString.trim();
    if (!cleanUrl.startsWith('postgres://') && !cleanUrl.startsWith('postgresql://')) {
      return { success: false, error: 'Format Connection String harus diawali dengan postgresql:// atau postgres://' };
    }

    if (cleanUrl.includes('.supabase.co') && cleanUrl.startsWith('postgresql://postgres:') && cleanUrl.includes('db.')) {
      return {
        success: false,
        error: 'Anda menggunakan Direct Connection Supabase (db.*.supabase.co) yang hanya mendukung IPv6. Silakan gunakan Connection Pooling (pooler.supabase.com) yang mendukung IPv4 di menu Connect Supabase.',
      };
    }

    const sql = getPostgresSql(cleanUrl);
    
    // Auto-create all 15 tables and indexes if not exist
    await ensureAllTables(sql);

    // Count total rows across all 15 tables
    let totalCount = 0;
    const tables = Object.values(COLLECTION_TABLE_MAP);
    for (const table of tables) {
      try {
        const countRes = await sql.unsafe(`SELECT count(*)::int as total FROM "${table}"`);
        totalCount += countRes[0]?.total || 0;
      } catch {
        // Table count fallback
      }
    }

    return { success: true, count: totalCount };
  } catch (err: any) {
    console.error('PostgreSQL connection test failed:', err);
    return { 
      success: false, 
      error: err?.message || 'Gagal terhubung ke database PostgreSQL. Pastikan host, port, username, password, dan nama database benar.' 
    };
  }
}
