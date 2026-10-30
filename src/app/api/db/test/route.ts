import { NextRequest, NextResponse } from 'next/server';
import { testPostgresConnection } from '@/lib/postgres-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connectionString } = body;

    const res = await testPostgresConnection(connectionString);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Koneksi ke database PostgreSQL berhasil! Tabel app_documents dan index otomatis dibuat & siap digunakan.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

