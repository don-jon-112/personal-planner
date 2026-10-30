import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  where
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { getActiveDatabaseProvider, getActivePostgresUrl } from "@/lib/db-config";

// Helper to get headers for PostgreSQL API requests
function getPostgresHeaders(): HeadersInit {
  const customUrl = getActivePostgresUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (customUrl) {
    headers['x-custom-db-url'] = customUrl;
  }
  return headers;
}

// Generic Hook to Fetch Documents
export interface UseCollectionOptions {
  projectId?: string | null;
  enabled?: boolean;
}

// Generic Hook to Fetch Documents (Supports optional projectId scoping & multi-database provider)
export function useCollection<T>(collectionName: string, options?: UseCollectionOptions) {
  const projectId = options?.projectId;
  const isEnabled = options?.enabled !== undefined ? options.enabled : true;

  return useQuery({
    queryKey: projectId ? [collectionName, { projectId }] : [collectionName],
    enabled: isEnabled,
    queryFn: async () => {
      // PostgreSQL / Supabase Provider via Connection String
      if (getActiveDatabaseProvider() === 'postgres') {
        let url = `/api/db/query?collection=${encodeURIComponent(collectionName)}`;
        if (projectId) {
          url += `&projectId=${encodeURIComponent(projectId)}`;
        }
        const res = await fetch(url, {
          headers: getPostgresHeaders(),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal mengambil data dari PostgreSQL');
        }
        const json = await res.json();
        return (json.data || []) as T[];
      }

      // Default Firebase Firestore Provider
      let q;
      if (projectId) {
        q = query(collection(db, collectionName), where("projectId", "==", projectId));
      } else {
        q = query(collection(db, collectionName));
      }
      const querySnapshot = await getDocs(q);
      const data: T[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id } as T);
      });
      return data;
    },
  });
}

// Helper to strip undefined values recursively so Firestore never throws "Unsupported field value: undefined"
export function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map(cleanUndefined);
  }
  // Do not modify special objects (Date, RegExp, or Firestore FieldValues/Snapshots)
  if (obj.constructor && obj.constructor.name !== 'Object') return obj;
  
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined && key !== "" && key !== "undefined" && key.trim() !== "") {
      const cleanedVal = cleanUndefined(val);
      if (cleanedVal !== undefined) {
        clean[key] = cleanedVal;
      }
    }
  }
  return clean;
}

// Generic Hook to Add a Document
export function useAddDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newData: any) => {
      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const sanitized = cleanUndefined(newData);
        const res = await fetch('/api/db/query', {
          method: 'POST',
          headers: getPostgresHeaders(),
          body: JSON.stringify({
            collection: collectionName,
            data: sanitized,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal menambahkan dokumen ke PostgreSQL');
        }
        const json = await res.json();
        return json.data;
      }

      // Default Firebase
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(collection(db, collectionName));
      const sanitized = cleanUndefined(newData);
      const writePromise = setDoc(docRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      writePromise.catch((err) => {
        console.warn(`Background add to ${collectionName} pending/error:`, err);
      });
      if (mode !== 'online') return { id: docRef.id, ...sanitized };
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Write pending sync:", err);
      }
      return { id: docRef.id, ...sanitized };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });
}

// Generic Hook to Update a Document
export function useUpdateDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const cleanId = String(id || '').trim();
      if (!cleanId || cleanId === 'undefined') {
        throw new Error(`Valid Document ID is required to update ${collectionName}, received: ${String(id)}`);
      }

      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const sanitized = cleanUndefined(data);
        const res = await fetch('/api/db/query', {
          method: 'PUT',
          headers: getPostgresHeaders(),
          body: JSON.stringify({
            collection: collectionName,
            id: cleanId,
            data: sanitized,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal mengupdate dokumen di PostgreSQL');
        }
        const json = await res.json();
        return json.data;
      }

      // Default Firebase
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, cleanId);
      const sanitized = cleanUndefined(data);
      const writePromise = setDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      writePromise.catch((err) => {
        console.warn(`Background update to ${collectionName} pending/error:`, err);
      });
      if (mode !== 'online') return { id: cleanId, ...sanitized };
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Update pending sync:", err);
      }
      return { id: cleanId, ...sanitized };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });
}

// Generic Hook to Delete a Document
export function useDeleteDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const cleanId = String(id || '').trim();
      if (!cleanId || cleanId === 'undefined') {
        throw new Error(`Valid Document ID is required to delete from ${collectionName}, received: ${String(id)}`);
      }

      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const res = await fetch(`/api/db/query?collection=${encodeURIComponent(collectionName)}&id=${encodeURIComponent(cleanId)}`, {
          method: 'DELETE',
          headers: getPostgresHeaders(),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal menghapus dokumen di PostgreSQL');
        }
        return cleanId;
      }

      // Default Firebase
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, cleanId);
      const writePromise = deleteDoc(docRef);
      writePromise.catch((err) => {
        console.warn(`Background delete from ${collectionName} pending/error:`, err);
      });
      if (mode !== 'online') return cleanId;
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Delete pending sync:", err);
      }
      return cleanId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });
}

// Generic Hook to Batch Update Documents
export function useUpdateBatch(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (updates: { id: string; data: any }[]) => {
      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const batch = updates.map((u) => ({
          id: String(u.id || '').trim(),
          data: cleanUndefined(u.data),
        })).filter(u => Boolean(u.id));

        const res = await fetch('/api/db/query', {
          method: 'POST',
          headers: getPostgresHeaders(),
          body: JSON.stringify({
            collection: collectionName,
            batch,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal batch update ke PostgreSQL');
        }
        return updates;
      }

      // Default Firebase
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const batch = writeBatch(db);
      updates.forEach((update) => {
        const cleanId = String(update.id || '').trim();
        if (cleanId && cleanId !== 'undefined') {
          const docRef = doc(db, collectionName, cleanId);
          const sanitized = cleanUndefined(update.data);
          batch.update(docRef, {
            ...sanitized,
            updatedAt: serverTimestamp(),
          });
        }
      });
      const writePromise = batch.commit();
      writePromise.catch((err) => {
        console.warn(`Background batch commit to ${collectionName} pending/error:`, err);
      });
      if (mode !== 'online') return updates;
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Batch pending sync:", err);
      }
      return updates;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    },
  });
}

// Generic Hook to Fetch a Single Document
export function useDocument<T>(collectionName: string, docId: string) {
  return useQuery({
    queryKey: [collectionName, docId],
    queryFn: async () => {
      const cleanId = String(docId || '').trim();
      if (!cleanId || cleanId === 'undefined') return null;

      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const res = await fetch(`/api/db/query?collection=${encodeURIComponent(collectionName)}&id=${encodeURIComponent(cleanId)}`, {
          headers: getPostgresHeaders(),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.data as T;
      }

      // Default Firebase
      const docRef = doc(db, collectionName, cleanId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { ...docSnap.data(), id: docSnap.id } as T;
      } else {
        return null;
      }
    },
    enabled: Boolean(docId && docId !== 'undefined'),
  });
}

// Generic Hook to Set (Create or Overwrite/Merge) a Single Document
export function useSetDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const cleanId = String(id || '').trim();
      if (!cleanId || cleanId === 'undefined') {
        throw new Error(`Valid Document ID is required to set document in ${collectionName}, received: ${String(id)}`);
      }

      // PostgreSQL Provider
      if (getActiveDatabaseProvider() === 'postgres') {
        const sanitized = cleanUndefined(data);
        const res = await fetch('/api/db/query', {
          method: 'PUT',
          headers: getPostgresHeaders(),
          body: JSON.stringify({
            collection: collectionName,
            id: cleanId,
            data: sanitized,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || 'Gagal set document ke PostgreSQL');
        }
        const json = await res.json();
        return json.data;
      }

      // Default Firebase
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, cleanId);
      const sanitized = cleanUndefined(data);
      // use merge: true to avoid overwriting fields not specified
      const writePromise = setDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      writePromise.catch((err) => {
        console.warn(`Background setDoc to ${collectionName} pending/error:`, err);
      });
      if (mode !== 'online') return { id: cleanId, ...sanitized };
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("SetDoc pending sync:", err);
      }
      return { id: cleanId, ...sanitized };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
      queryClient.invalidateQueries({ queryKey: [collectionName, variables.id] });
    },
  });
}
