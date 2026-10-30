import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, ensureAppDocumentsTable } from '@/lib/postgres-server';

// 1. GET: Fetch collection or single document
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collectionName = searchParams.get('collection');
    const docId = searchParams.get('id');
    const projectId = searchParams.get('projectId');
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;

    if (!collectionName) {
      return NextResponse.json({ error: 'collection parameter is required' }, { status: 400 });
    }

    const sql = getPostgresSql(customDbUrl);

    // Single document fetch
    if (docId) {
      const rows = await sql`
        SELECT id, data FROM app_documents
        WHERE collection_name = ${collectionName} AND id = ${docId}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ data: null });
      }
      return NextResponse.json({ data: { ...rows[0].data, id: rows[0].id } });
    }

    // Collection fetch (supports optional projectId filter)
    let rows;
    if (projectId) {
      rows = await sql`
        SELECT id, data FROM app_documents
        WHERE collection_name = ${collectionName} AND project_id = ${projectId}
        ORDER BY updated_at DESC
      `;
    } else {
      rows = await sql`
        SELECT id, data FROM app_documents
        WHERE collection_name = ${collectionName}
        ORDER BY updated_at DESC
      `;
    }

    const data = rows.map((r: any) => ({ ...r.data, id: r.id }));
    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('PostgreSQL query GET error:', err);
    return NextResponse.json({ error: err?.message || 'Database query error' }, { status: 500 });
  }
}

// 2. POST: Add or Batch Update documents
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;
    const sql = getPostgresSql(customDbUrl);

    // Batch update mode
    if (body.batch && Array.isArray(body.batch)) {
      const { collection: colName, batch } = body;
      for (const item of batch) {
        const docId = String(item.id || '').trim();
        if (!docId) continue;
        const existing = await sql`
          SELECT data FROM app_documents
          WHERE collection_name = ${colName} AND id = ${docId}
          LIMIT 1
        `;
        const mergedData = { ...(existing[0]?.data || {}), ...item.data };
        const projectId = mergedData.projectId || null;
        await sql`
          INSERT INTO app_documents (id, collection_name, project_id, data, updated_at)
          VALUES (${docId}, ${colName}, ${projectId}, ${JSON.stringify(mergedData)}::jsonb, NOW())
          ON CONFLICT (collection_name, id)
          DO UPDATE SET
            project_id = EXCLUDED.project_id,
            data = EXCLUDED.data,
            updated_at = NOW();
        `;
      }
      return NextResponse.json({ success: true, count: batch.length });
    }

    // Single document insert
    const { collection: colName, id, data } = body;
    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const projectId = data?.projectId || null;

    await sql`
      INSERT INTO app_documents (id, collection_name, project_id, data, updated_at)
      VALUES (${docId}, ${colName}, ${projectId}, ${JSON.stringify(data)}::jsonb, NOW())
      ON CONFLICT (collection_name, id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        data = EXCLUDED.data,
        updated_at = NOW();
    `;

    return NextResponse.json({ data: { ...data, id: docId } });
  } catch (err: any) {
    console.error('PostgreSQL query POST error:', err);
    return NextResponse.json({ error: err?.message || 'Database insert error' }, { status: 500 });
  }
}

// 3. PUT: Update/Merge document
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;
    const { collection: colName, id, data } = body;

    if (!colName || !id) {
      return NextResponse.json({ error: 'collection and id are required' }, { status: 400 });
    }

    const sql = getPostgresSql(customDbUrl);

    // Fetch existing data to merge
    const existing = await sql`
      SELECT data FROM app_documents
      WHERE collection_name = ${colName} AND id = ${id}
      LIMIT 1
    `;

    const mergedData = { ...(existing[0]?.data || {}), ...data };
    const projectId = mergedData.projectId || null;

    await sql`
      INSERT INTO app_documents (id, collection_name, project_id, data, updated_at)
      VALUES (${id}, ${colName}, ${projectId}, ${JSON.stringify(mergedData)}::jsonb, NOW())
      ON CONFLICT (collection_name, id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        data = EXCLUDED.data,
        updated_at = NOW();
    `;

    return NextResponse.json({ data: { ...mergedData, id } });
  } catch (err: any) {
    console.error('PostgreSQL query PUT error:', err);
    return NextResponse.json({ error: err?.message || 'Database update error' }, { status: 500 });
  }
}

// 4. DELETE: Remove document
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const collectionName = searchParams.get('collection');
    const docId = searchParams.get('id');
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;

    if (!collectionName || !docId) {
      return NextResponse.json({ error: 'collection and id are required' }, { status: 400 });
    }

    const sql = getPostgresSql(customDbUrl);

    await sql`
      DELETE FROM app_documents
      WHERE collection_name = ${collectionName} AND id = ${docId}
    `;

    return NextResponse.json({ success: true, id: docId });
  } catch (err: any) {
    console.error('PostgreSQL query DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Database delete error' }, { status: 500 });
  }
}

