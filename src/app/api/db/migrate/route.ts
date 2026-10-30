import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, ensureAppDocumentsTable } from '@/lib/postgres-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connectionString, collectionName, items } = body;

    if (!connectionString || !collectionName || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Parameter tidak lengkap.' }, { status: 400 });
    }

    const sql = getPostgresSql(connectionString);

    // 1. Ensure table exists
    await ensureAppDocumentsTable(sql);

    // 2. Insert items in chunks
    if (items.length > 0) {
      for (const item of items) {
        const docId = String(item.id || '').trim();
        if (!docId) continue;
        const { id, ...dataPayload } = item;
        const projectId = item.projectId || null;

        await sql`
          INSERT INTO app_documents (id, collection_name, project_id, data, updated_at)
          VALUES (
            ${docId},
            ${collectionName},
            ${projectId},
            ${sql.json(dataPayload)},
            NOW()
          )
          ON CONFLICT (collection_name, id)
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
      migratedCount: items.length,
    });
  } catch (err: any) {
    console.error('Migration chunk error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Gagal memigrasikan batch.' }, { status: 500 });
  }
}
