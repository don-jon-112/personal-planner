import postgres from 'postgres';

// Client connection pool map cached by connection URL to prevent connection exhaustion
const clientPool = new Map<string, postgres.Sql>();

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

// 1. Ensure Table Schema Exists in Target Database (Auto-Migration)
export async function ensureAppDocumentsTable(sql: postgres.Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS app_documents (
      id TEXT NOT NULL,
      collection_name TEXT NOT NULL,
      project_id TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (collection_name, id)
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_docs_coll ON app_documents(collection_name);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_docs_project ON app_documents(collection_name, project_id);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_docs_updated ON app_documents(updated_at DESC);
  `;
}

// 2. Test Connection, Auto-Ensure Table, and Count Rows
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
    
    // Auto-create table if not exists so it's 100% ready immediately
    await ensureAppDocumentsTable(sql);

    // Count existing rows
    const countRes = await sql`SELECT count(*)::int as total FROM app_documents`;
    const count = countRes[0]?.total || 0;

    return { success: true, count };
  } catch (err: any) {
    console.error('PostgreSQL connection test failed:', err);
    return { 
      success: false, 
      error: err?.message || 'Gagal terhubung ke database PostgreSQL. Pastikan host, port, username, password, dan nama database benar.' 
    };
  }
}
