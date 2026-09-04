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

// Generic Hook to Fetch Documents
export function useCollection<T>(collectionName: string) {
  return useQuery({
    queryKey: [collectionName],
    queryFn: async () => {
      // Create a query ordered by createdAt descending if possible
      // Note: This requires an index in Firestore if combined with other filters,
      // but simple orderBy is usually fine. Let's just fetch all for now.
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

// Helper to strip undefined values so Firestore never throws "Unsupported field value: undefined"
function cleanUndefined(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

// Generic Hook to Add a Document
export function useAddDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newData: any) => {
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(collection(db, collectionName));
      const sanitized = cleanUndefined(newData);
      const writePromise = setDoc(docRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (mode !== 'online') return { id: docRef.id, ...sanitized };
      await writePromise;
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
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      const sanitized = cleanUndefined(data);
      const writePromise = updateDoc(docRef, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
      if (mode !== 'online') return { id, ...sanitized };
      await writePromise;
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
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      const writePromise = deleteDoc(docRef);
      if (mode !== 'online') return id;
      await writePromise;
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
      await writePromise;
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
      const mode = typeof window !== 'undefined' ? localStorage.getItem('syncMode') : 'online';
      const docRef = doc(db, collectionName, id);
      // use merge: true to avoid overwriting fields not specified
      const writePromise = setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (mode !== 'online') return { id, ...data };
      await writePromise;
      return { id, ...data };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
      queryClient.invalidateQueries({ queryKey: [collectionName, variables.id] });
    },
  });
}
