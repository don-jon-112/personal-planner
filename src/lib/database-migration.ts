import { getDocs, collection } from 'firebase/firestore';
import { db } from '@/firebase/config';

export const ALL_MIGRATION_COLLECTIONS = [
  "projects",
  "timelineEpics",
  "timelineTasks",
  "timelinePics",
  "timelineStatuses",
  "timelineHolidays",
  "notes",
  "bugReports",
  "weeklyReports",
  "secretKeys",
  "appSettings",
  "todos",
  "users",
  "roles",
  "assignmentLogs"
];

export interface MigrationProgress {
  currentCollection: string;
  collectionIndex: number;
  totalCollections: number;
  currentItems: number;
  totalItems: number;
  percentage: number;
  statusText: string;
}

// 1. Test PostgreSQL Connection via API
export async function testPostgresConnection(connectionString: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!connectionString || !connectionString.trim()) {
      return { success: false, error: 'Connection string PostgreSQL wajib diisi.' };
    }

    const res = await fetch('/api/db/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: connectionString.trim() }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Gagal terhubung ke database PostgreSQL.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal menghubungi server untuk menguji koneksi.' };
  }
}

// 2. Fetch All Source Data from Firestore
export async function fetchAllActiveFirestoreData(): Promise<Record<string, any[]>> {
  const result: Record<string, any[]> = {};

  for (const col of ALL_MIGRATION_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, col));
      const items: any[] = [];
      snap.forEach((d) => {
        items.push({ id: d.id, ...d.data() });
      });
      result[col] = items;
    } catch (err) {
      console.warn(`Failed reading source collection ${col}:`, err);
      result[col] = [];
    }
  }

  return result;
}

// 3. Download automatic Safety Backup JSON
export function triggerSafetyBackupDownload(data: Record<string, any[]>): void {
  try {
    let totalDocs = 0;
    const summary: Record<string, number> = {};
    for (const [col, items] of Object.entries(data)) {
      summary[col] = items.length;
      totalDocs += items.length;
    }

    const payload = {
      appName: "Personal Planner",
      exportType: "safety_pre_migration_backup",
      timestamp: new Date().toISOString(),
      totalDocuments: totalDocs,
      summary,
      collections: data,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = `safety-backup-before-migration-${dateStr}-${timeStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn("Safety backup download failed (non-critical):", err);
  }
}

// 4. Migrate Data from Firebase to PostgreSQL via Server API
export async function migrateToPostgres(
  connectionString: string,
  allData: Record<string, any[]>,
  onProgress: (progress: MigrationProgress) => void
): Promise<{ success: boolean; totalMigrated: number; summary: Record<string, number> }> {
  const summary: Record<string, number> = {};
  let totalMigrated = 0;
  const totalCollections = ALL_MIGRATION_COLLECTIONS.length;

  for (let cIdx = 0; cIdx < totalCollections; cIdx++) {
    const colName = ALL_MIGRATION_COLLECTIONS[cIdx];
    const items = allData[colName] || [];
    summary[colName] = 0;

    onProgress({
      currentCollection: colName,
      collectionIndex: cIdx + 1,
      totalCollections,
      currentItems: 0,
      totalItems: items.length,
      percentage: Math.round((cIdx / totalCollections) * 100),
      statusText: `Menulis ke PostgreSQL: "${colName}" (${items.length} baris)...`
    });

    const CHUNK_SIZE = 100;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);

      const res = await fetch('/api/db/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString,
          collectionName: colName,
          items: chunk,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Gagal menulis [${colName}]: ${errData?.error || res.statusText}`);
      }

      summary[colName] += chunk.length;
      totalMigrated += chunk.length;

      onProgress({
        currentCollection: colName,
        collectionIndex: cIdx + 1,
        totalCollections,
        currentItems: Math.min(i + CHUNK_SIZE, items.length),
        totalItems: items.length,
        percentage: Math.round(((cIdx + (i + chunk.length) / (items.length || 1)) / totalCollections) * 100),
        statusText: `Menulis ${colName} (${Math.min(i + CHUNK_SIZE, items.length)}/${items.length})...`
      });
    }
  }

  onProgress({
    currentCollection: "Selesai",
    collectionIndex: totalCollections,
    totalCollections,
    currentItems: totalMigrated,
    totalItems: totalMigrated,
    percentage: 100,
    statusText: "Migrasi ke PostgreSQL selesai 100%!"
  });

  return { success: true, totalMigrated, summary };
}
