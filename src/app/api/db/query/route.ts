import { NextRequest, NextResponse } from 'next/server';
import { getPostgresSql, getTableName, ensureTableExists } from '@/lib/postgres-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

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
        SELECT id, project_id, data FROM ${sql(tableName)}
        WHERE id = ${docId}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ data: null }, { headers: NO_CACHE_HEADERS });
      }
      const row = rows[0];
      const rowData = typeof row.data === 'object' && row.data !== null ? row.data : {};
      return NextResponse.json({
        data: {
          ...rowData,
          id: row.id,
          projectId: row.project_id || rowData.projectId || null,
        }
      }, { headers: NO_CACHE_HEADERS });
    }

    // Collection fetch (supports optional projectId filter)
    let rows;
    if (projectId) {
      rows = await sql`
        SELECT id, project_id, data FROM ${sql(tableName)}
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
      `;
    } else {
      rows = await sql`
        SELECT id, project_id, data FROM ${sql(tableName)}
        ORDER BY updated_at DESC
      `;
    }

    const data = rows.map((r: any) => {
      const rowData = typeof r.data === 'object' && r.data !== null ? r.data : {};
      return {
        ...rowData,
        id: r.id,
        projectId: r.project_id || rowData.projectId || null,
      };
    });
    return NextResponse.json({ data }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('PostgreSQL query GET error:', err);
    return NextResponse.json({ error: err?.message || 'Database query error' }, { status: 500, headers: NO_CACHE_HEADERS });
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
          SELECT data, project_id FROM ${sql(tableName)}
          WHERE id = ${docId}
          LIMIT 1
        `;
        const existingData = existing[0]?.data || {};
        const mergedData = { ...existingData, ...item.data };
        const projectId = mergedData.projectId || existing[0]?.project_id || null;
        if (projectId) {
          mergedData.projectId = projectId;
        }

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
      return NextResponse.json({ success: true, count: batch.length }, { headers: NO_CACHE_HEADERS });
    }

    // Single document insert
    const { collection: colName, id, data } = body;
    const tableName = getTableName(colName);
    await ensureTableExists(sql, tableName);

    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const projectId = data?.projectId || body?.projectId || null;
    const finalData = { ...data };
    if (projectId) {
      finalData.projectId = projectId;
    }

    await sql`
      INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
      VALUES (${docId}, ${projectId}, ${sql.json(finalData)}, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        data = EXCLUDED.data,
        updated_at = NOW();
    `;

    return NextResponse.json({ data: { ...finalData, id: docId, projectId } }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('PostgreSQL query POST error:', err);
    return NextResponse.json({ error: err?.message || 'Database insert error' }, { status: 500, headers: NO_CACHE_HEADERS });
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
      SELECT data, project_id FROM ${sql(tableName)}
      WHERE id = ${id}
      LIMIT 1
    `;

    const existingData = existing[0]?.data || {};
    const mergedData = { ...existingData, ...data };
    const projectId = mergedData.projectId || existing[0]?.project_id || null;
    if (projectId) {
      mergedData.projectId = projectId;
    }

    await sql`
      INSERT INTO ${sql(tableName)} (id, project_id, data, updated_at)
      VALUES (${id}, ${projectId}, ${sql.json(mergedData)}, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        project_id = EXCLUDED.project_id,
        data = EXCLUDED.data,
        updated_at = NOW();
    `;

    return NextResponse.json({ data: { ...mergedData, id, projectId } }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('PostgreSQL query PUT error:', err);
    return NextResponse.json({ error: err?.message || 'Database update error' }, { status: 500, headers: NO_CACHE_HEADERS });
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

    return NextResponse.json({ success: true, id: docId }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('PostgreSQL query DELETE error:', err);
    return NextResponse.json({ error: err?.message || 'Database delete error' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
