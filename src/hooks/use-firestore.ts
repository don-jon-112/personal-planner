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
  writeBatch
} from "firebase/firestore";
import { db } from "@/firebase/config";
import { 
  isDemoMode, 
  getDemoCollection, 
  getDemoDocument, 
  addDemoDocument, 
  updateDemoDocument, 
  deleteDemoDocument, 
  updateBatchDemoDocuments 
} from "@/lib/demo-storage";
import { useEffect } from "react";

// Generic Hook to Fetch Documents
export function useCollection<T>(collectionName: string) {
  const queryClient = useQueryClient();

  // Listen to demo reset events to immediately refresh queries
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleReset = () => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
    };
    window.addEventListener("demoDataReset", handleReset);
    return () => window.removeEventListener("demoDataReset", handleReset);
  }, [queryClient, collectionName]);

  return useQuery({
    queryKey: [collectionName],
    queryFn: async () => {
      if (isDemoMode()) {
        return getDemoCollection<T>(collectionName);
      }

      const q = query(collection(db, collectionName));
      const querySnapshot = await getDocs(q);
      const data: T[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as T);
      });
      return data;
    },
  });
}

// Helper to strip undefined values recursively so Firestore never throws "Unsupported field value: undefined"
function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  // Do not modify special objects (Date, RegExp, or Firestore FieldValues/Snapshots)
  if (obj.constructor && obj.constructor.name !== 'Object') return obj;
  
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = cleanUndefined(val);
    }
  }
  return clean;
}

// Generic Hook to Add a Document
export function useAddDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newData: any) => {
      const sanitized = cleanUndefined(newData);
      if (isDemoMode()) {
        return addDemoDocument(collectionName, sanitized);
      }

      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(collection(db, collectionName));
      const writePromise = setDoc(docRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
      const sanitized = cleanUndefined(data);
      if (isDemoMode()) {
        return updateDemoDocument(collectionName, id, sanitized);
      }

      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      const writePromise = setDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (mode !== 'online') return { id, ...sanitized };
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Update pending sync:", err);
      }
      return { id, ...sanitized };
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
      if (isDemoMode()) {
        return deleteDemoDocument(collectionName, id);
      }

      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      const writePromise = deleteDoc(docRef);
      if (mode !== 'online') return id;
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("Delete pending sync:", err);
      }
      return id;
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
      if (isDemoMode()) {
        return updateBatchDemoDocuments(collectionName, updates);
      }

      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const batch = writeBatch(db);
      updates.forEach((update) => {
        const docRef = doc(db, collectionName, update.id);
        const sanitized = cleanUndefined(update.data);
        batch.update(docRef, {
          ...sanitized,
          updatedAt: serverTimestamp(),
        });
      });
      const writePromise = batch.commit();
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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleReset = () => {
      queryClient.invalidateQueries({ queryKey: [collectionName, docId] });
    };
    window.addEventListener("demoDataReset", handleReset);
    return () => window.removeEventListener("demoDataReset", handleReset);
  }, [queryClient, collectionName, docId]);

  return useQuery({
    queryKey: [collectionName, docId],
    queryFn: async () => {
      if (isDemoMode()) {
        return getDemoDocument<T>(collectionName, docId);
      }

      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
      } else {
        return null;
      }
    },
  });
}

// Generic Hook to Set (Create or Overwrite/Merge) a Single Document
export function useSetDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const sanitized = cleanUndefined(data);
      if (isDemoMode()) {
        return updateDemoDocument(collectionName, id, sanitized);
      }

      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      const writePromise = setDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (mode !== 'online') return { id, ...sanitized };
      try {
        await Promise.race([
          writePromise,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (err) {
        console.warn("SetDoc pending sync:", err);
      }
      return { id, ...sanitized };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
      queryClient.invalidateQueries({ queryKey: [collectionName, variables.id] });
    },
  });
}
