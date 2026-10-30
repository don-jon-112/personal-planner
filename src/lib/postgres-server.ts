import postgres from 'postgres';

// Global cache for serverless environments to prevent connection exhaustion
let globalSql: postgres.Sql | null = null;
let currentDbUrl = '';

export function getPostgresSql(customUrl?: string): postgres.Sql {
  const url = customUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured.');
  }

  // Use cached client if URL hasn't changed and no customUrl is provided
  if (!customUrl && globalSql && currentDbUrl === url) {
    return globalSql;
  }

  // Determine SSL: cloud Postgres (Supabase, Neon, Railway, AWS) requires SSL
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  const sql = postgres(url, {
    ssl: isLocal ? false : 'require',
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // Disables prepared statements for full compatibility with Supabase Pooler (PgBouncer)
  });

  if (!customUrl) {
    globalSql = sql;
    currentDbUrl = url;
  }

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
  let sql: postgres.Sql | null = null;
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

    sql = getPostgresSql(cleanUrl);
    
    // Auto-create table if not exists so it's 100% ready immediately
    await ensureAppDocumentsTable(sql);

    // Count existing rows
    const countRes = await sql`SELECT count(*)::int as total FROM app_documents`;
    const count = countRes[0]?.total || 0;

    await sql.end({ timeout: 5 });
    return { success: true, count };
  } catch (err: any) {
    if (sql) {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
    console.error('PostgreSQL connection test failed:', err);
    return { 
      success: false, 
      error: err?.message || 'Gagal terhubung ke database PostgreSQL. Pastikan host, port, username, password, dan nama database benar.' 
    };
  }
}
