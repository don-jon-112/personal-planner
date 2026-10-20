import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableMultiTabIndexedDbPersistence, disableNetwork, enableNetwork } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
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

  const pathname = window.location.pathname;
  const isAlwaysOnline =
    pathname.startsWith('/guest-timeline') ||
    pathname.startsWith('/guest-secrets') ||
    pathname === '/login';

  if (isAlwaysOnline) {
    // Guest timelines and Login MUST always be connected to fetch live cloud data
    enableNetwork(db).catch(console.error);
  } else {
    const syncMode = localStorage.getItem('syncMode');
    if (syncMode === 'local') {
      // Respect user's explicit local-only offline mode
      disableNetwork(db).catch(console.error);
    } else {
      // Default to online so users load projects, roles, and collections
      enableNetwork(db).catch(console.error);
    }
  }
}

export { app, db };
