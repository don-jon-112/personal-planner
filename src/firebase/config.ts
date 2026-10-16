import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence, disableNetwork, enableNetwork } from 'firebase/firestore';
import { isDemoMode } from '@/lib/demo-storage';

// Safe fallback configuration so build & deployment on Vercel never crashes
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDemoModeOnlyMockKey00000000000",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-planner.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-planner",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-planner.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1234567890:web:demo",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn("Multiple tabs open, persistence fallback.");
    } else if (err.code == 'unimplemented') {
      console.warn("Browser doesn't support indexedDB persistence.");
    }
  });

  if (isDemoMode()) {
    // In demo mode, explicitly disconnect network to ensure 0% cloud calls
    disableNetwork(db).catch(() => {});
  } else {
    const pathname = window.location.pathname;
    const isAlwaysOnline =
      pathname.startsWith('/guest-timeline') ||
      pathname.startsWith('/guest-secrets') ||
      pathname === '/login';

    if (isAlwaysOnline) {
      enableNetwork(db).catch(console.error);
    } else {
      const syncMode = localStorage.getItem('syncMode');
      if (syncMode === 'local') {
        disableNetwork(db).catch(console.error);
      } else {
        enableNetwork(db).catch(console.error);
      }
    }
  }
}

export { app, db };
