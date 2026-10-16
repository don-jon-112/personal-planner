import { getDefaultDemoData } from "./demo-data";

const STORAGE_PREFIX = "planner_demo_col_";
const INIT_KEY = "planner_demo_initialized";

export const IS_DEMO_BUILD = true; // In this demo branch, demo mode is enabled

export function isDemoMode(): boolean {
  return IS_DEMO_BUILD;
}

export function initDemoStorage(): void {
  if (typeof window === "undefined") return;

  const initialized = localStorage.getItem(INIT_KEY);
  if (initialized !== "true") {
    resetDemoData();
  }
}

export function resetDemoData(): void {
  if (typeof window === "undefined") return;

  const defaultData = getDefaultDemoData();
  Object.entries(defaultData).forEach(([colName, data]) => {
    localStorage.setItem(`${STORAGE_PREFIX}${colName}`, JSON.stringify(data));
  });

  // Ensure demo auth session default to admin if none exists
  const currentSession = localStorage.getItem("planner_auth_session");
  if (!currentSession) {
    const adminUser = defaultData.users.find((u) => u.username === "admin");
    if (adminUser) {
      const session = {
        userId: adminUser.id,
        username: adminUser.username,
        name: adminUser.name,
        isSuperAdmin: true,
        projectIds: adminUser.projectIds,
        projectRoles: adminUser.projectRoles,
      };
      localStorage.setItem("planner_auth_session", JSON.stringify(session));
    }
  }

  // Set default active project
  localStorage.setItem("planner_active_project_id", "proj-digiroom");
  localStorage.setItem(INIT_KEY, "true");
  localStorage.setItem("syncMode", "demo");

  // Broadcast event so queries and UI update reactively
  window.dispatchEvent(new Event("demoDataReset"));
  window.dispatchEvent(new Event("syncModeChanged"));
}

export function getDemoCollection<T>(collectionName: string): T[] {
  if (typeof window === "undefined") return [];

  initDemoStorage();
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${collectionName}`);
    if (!raw) {
      const defaultData = getDefaultDemoData() as Record<string, any[]>;
      const fallback = defaultData[collectionName] || [];
      localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(fallback));
      return fallback as T[];
    }
    return JSON.parse(raw) as T[];
  } catch (err) {
    console.warn(`Failed to parse demo collection "${collectionName}":`, err);
    return [];
  }
}

export function getDemoDocument<T>(collectionName: string, id: string): T | null {
  const col = getDemoCollection<any>(collectionName);
  return (col.find((item) => item.id === id) as T) || null;
}

export function addDemoDocument(collectionName: string, data: any): any {
  const col = getDemoCollection<any>(collectionName);
  const newId = data.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record = {
    ...data,
    id: newId,
    createdAt: data.createdAt || { seconds: Math.floor(Date.now() / 1000) },
    updatedAt: { seconds: Math.floor(Date.now() / 1000) },
  };

  const nextCol = [record, ...col];
  if (typeof window !== "undefined") {
    localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(nextCol));
  }
  return record;
}

export function updateDemoDocument(collectionName: string, id: string, data: any): any {
  const col = getDemoCollection<any>(collectionName);
  const index = col.findIndex((item) => item.id === id);

  const updatedRecord = {
    ...(index >= 0 ? col[index] : {}),
    ...data,
    id,
    updatedAt: { seconds: Math.floor(Date.now() / 1000) },
  };

  let nextCol: any[];
  if (index >= 0) {
    nextCol = [...col];
    nextCol[index] = updatedRecord;
  } else {
    nextCol = [...col, updatedRecord];
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(nextCol));
  }
  return updatedRecord;
}

export function deleteDemoDocument(collectionName: string, id: string): string {
  const col = getDemoCollection<any>(collectionName);
  const nextCol = col.filter((item) => item.id !== id);

  if (typeof window !== "undefined") {
    localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(nextCol));
  }
  return id;
}

export function updateBatchDemoDocuments(
  collectionName: string,
  updates: { id: string; data: any }[]
): any[] {
  const col = getDemoCollection<any>(collectionName);
  const colMap = new Map<string, any>(col.map((item) => [item.id, item]));

  updates.forEach(({ id, data }) => {
    const existing = colMap.get(id) || {};
    colMap.set(id, {
      ...existing,
      ...data,
      id,
      updatedAt: { seconds: Math.floor(Date.now() / 1000) },
    });
  });

  const nextCol = Array.from(colMap.values());
  if (typeof window !== "undefined") {
    localStorage.setItem(`${STORAGE_PREFIX}${collectionName}`, JSON.stringify(nextCol));
  }
  return updates;
}
