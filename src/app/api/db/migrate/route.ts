import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, ensureAppDocumentsTable } from '@/lib/postgres-server';

export async function POST(req: NextRequest) {
  let sql: any = null;
  try {
    const body = await req.json();
    const { connectionString, collectionName, items } = body;

    if (!connectionString || !collectionName || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Parameter tidak lengkap.' }, { status: 400 });
    }

    sql = getPostgresSql(connectionString);

    // 1. Ensure table exists
    await ensureAppDocumentsTable(sql);

    // 2. Insert items in chunks
    if (items.length > 0) {
      const rows = items.map((item: any) => {
        const docId = String(item.id || '').trim();
        const { id, ...dataPayload } = item;
        const projectId = item.projectId || null;
        return {
          id: docId,
          collection_name: collectionName,
          project_id: projectId,
          data: JSON.stringify(dataPayload),
          updated_at: new Date().toISOString(),
        };
      }).filter((r: any) => Boolean(r.id));

      if (rows.length > 0) {
        // Multi-row upsert
        for (const row of rows) {
          await sql`
            INSERT INTO app_documents (id, collection_name, project_id, data, updated_at)
            VALUES (${row.id}, ${row.collection_name}, ${row.project_id}, ${row.data}::jsonb, ${row.updated_at})
            ON CONFLICT (collection_name, id)
            DO UPDATE SET
              project_id = EXCLUDED.project_id,
              data = EXCLUDED.data,
              updated_at = EXCLUDED.updated_at;
          `;
        }
      }
    }

    return NextResponse.json({
      success: true,
      collection: collectionName,
      migratedCount: items.length,
    });
  } catch (err: any) {
    console.error('Migration chunk error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Gagal memigrasikan batch.' }, { status: 500 });
  } finally {
    if (sql) {
      await sql.end({ timeout: 5 }).catch(() => {});
    }
  }
}

