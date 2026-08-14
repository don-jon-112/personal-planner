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

// Generic Hook to Add a Document
export function useAddDocument(collectionName: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (newData: any) => {
      const docRef = await addDoc(collection(db, collectionName), {
        ...newData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: docRef.id, ...newData };
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
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return { id, ...data };
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
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
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
      const batch = writeBatch(db);
      updates.forEach((update) => {
        const docRef = doc(db, collectionName, update.id);
        batch.update(docRef, {
          ...update.data,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
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
      const docRef = doc(db, collectionName, id);
      // use merge: true to avoid overwriting fields not specified
      await setDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      return { id, ...data };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [collectionName] });
      queryClient.invalidateQueries({ queryKey: [collectionName, variables.id] });
    },
  });
}
