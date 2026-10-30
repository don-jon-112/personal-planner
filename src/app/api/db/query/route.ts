import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, getTableName, ensureTableExists } from '@/lib/postgres-server';

// 1. GET: Fetch collection or single document from dedicated table
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
    const tableName = getTableName(collectionName);

    // Auto-ensure table exists
    await ensureTableExists(sql, tableName);

    // Single document fetch
    if (docId) {
      const rows = await sql`
        SELECT id, data FROM ${sql(tableName)}
        WHERE id = ${docId}
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
        SELECT id, data FROM ${sql(tableName)}
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
      `;
    } else {
      rows = await sql`
        SELECT id, data FROM ${sql(tableName)}
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

// 2. POST: Add or Batch Update documents to dedicated table
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;
    const sql = getPostgresSql(customDbUrl);

    // Batch update mode
    if (body.batch && Array.isArray(body.batch)) {
      const { collection: colName, batch } = body;
      const tableName = getTableName(colName);
      await ensureTableExists(sql, tableName);

      for (const item of batch) {
        const docId = String(item.id || '').trim();
        if (!docId) continue;
        const existing = await sql`
          SELECT data FROM ${sql(tableName)}
          WHERE id = ${docId}
          LIMIT 1
        `;
        const mergedData = { ...(existing[0]?.data || {}), ...item.data };
        const projectId = mergedData.projectId || null;
        await sql`
          INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
          VALUES (${docId}, ${projectId}, ${sql.json(mergedData)}, NOW())
          ON CONFLICT (id)
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
    const tableName = getTableName(colName);
    await ensureTableExists(sql, tableName);

    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const projectId = data?.projectId || null;

    await sql`
      INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
      VALUES (${docId}, ${projectId}, ${sql.json(data)}, NOW())
      ON CONFLICT (id)
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

// 3. PUT: Update/Merge document in dedicated table
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const customDbUrl = req.headers.get('x-custom-db-url') || undefined;
    const { collection: colName, id, data } = body;

    if (!colName || !id) {
      return NextResponse.json({ error: 'collection and id are required' }, { status: 400 });
    }

    const sql = getPostgresSql(customDbUrl);
    const tableName = getTableName(colName);
    await ensureTableExists(sql, tableName);

    // Fetch existing data to merge
    const existing = await sql`
      SELECT data FROM ${sql(tableName)}
      WHERE id = ${id}
      LIMIT 1
    `;

    const mergedData = { ...(existing[0]?.data || {}), ...data };
    const projectId = mergedData.projectId || null;

    await sql`
      INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
      VALUES (${id}, ${projectId}, ${sql.json(mergedData)}, NOW())
      ON CONFLICT (id)
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

// 4. DELETE: Remove document from dedicated table
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
    const tableName = getTableName(collectionName);
    await ensureTableExists(sql, tableName);

    await sql`
      DELETE FROM ${sql(tableName)}
      WHERE id = ${docId}
    `;

    return NextResponse.json({ success: true, id: docId });
  } catch (err: any) {
    console.error('PostgreSQL query DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Database delete error' }, { status: 500 });
  }
}
