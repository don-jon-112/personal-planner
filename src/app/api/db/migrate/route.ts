import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, getTableName, ensureTableExists } from '@/lib/postgres-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connectionString, collectionName, items } = body;

    if (!connectionString || !collectionName || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Parameter tidak lengkap.' }, { status: 400 });
    }

    const sql = getPostgresSql(connectionString);
    const tableName = getTableName(collectionName);

    // 1. Ensure this specific table exists
    await ensureTableExists(sql, tableName);

    // 2. Insert items into dedicated table
    if (items.length > 0) {
      for (const item of items) {
        const docId = String(item.id || '').trim();
        if (!docId) continue;
        const { id, ...dataPayload } = item;
        const projectId = item.projectId || null;

        await sql`
          INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
          VALUES (
            ${docId},
            ${projectId},
            ${sql.json(dataPayload)},
            NOW()
          )
          ON CONFLICT (id)
          DO UPDATE SET
            project_id = EXCLUDED.project_id,
            data = EXCLUDED.data,
            updated_at = NOW();
        `;
      }
    }

    return NextResponse.json({
      success: true,
      collection: collectionName,
      table: tableName,
      migratedCount: items.length,
    });
  } catch (err: any) {
    console.error('Migration chunk error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Gagal memigrasikan batch.' }, { status: 500 });
  }
}
