'use server'

import { cookies } from 'next/headers'

export interface SessionData {
  userId: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
  projectIds?: string[];
  projectRoles?: Record<string, string[]>;
}

export async function loginWithMaster(password: string) {
  const correctPassword = process.env.SITE_PASSWORD;
  const guestPassword = process.env.GUESS_PASSWORD;

  if (password === correctPassword) {
    const cookieStore = await cookies();
    cookieStore.set('site_password', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });
    cookieStore.set('user_session', JSON.stringify({
      userId: 'master_admin',
      username: 'admin',
      name: 'Master Admin',
      isSuperAdmin: true,
    }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return { 
      success: true, 
      session: { 
        userId: 'master_admin', 
        username: 'admin', 
        name: 'Master Admin', 
        isSuperAdmin: true 
      } 
    };
  } else if (password === guestPassword) {
    const cookieStore = await cookies();
    cookieStore.set('site_password', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });
    return { success: true, isGuest: true };
  } else {
    return { success: false, error: 'Incorrect master password' };
  }
}

export async function setAuthSession(session: SessionData) {
  const cookieStore = await cookies();
  cookieStore.set('user_session', JSON.stringify(session), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  cookieStore.set('site_password', 'authenticated_user', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('site_password');
  cookieStore.delete('user_session');
  return { success: true };
}

export async function authenticateUser(username: string, password: string) {
  const trimmedUser = (username || '').trim();
  const rawPass = password || '';
  const trimmedPass = (password || '').trim();

  if (!trimmedUser) {
    return { success: false, error: 'Username is required' };
  }

  // 1. Check if user is entering Master Admin password directly
  const masterPassword = process.env.SITE_PASSWORD;
  if (masterPassword && (rawPass === masterPassword || trimmedPass === masterPassword)) {
    const session: SessionData = {
      userId: 'master_admin',
      username: trimmedUser || 'admin',
      name: 'Master Admin',
      isSuperAdmin: true,
    };
    await setAuthSession(session);
    return { success: true, session };
  }

  // 2. Query Firestore Cloud users collection directly on server
  try {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, collection, getDocs } = await import('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

    const snapshot = await getDocs(collection(db, 'users'));
    let matchedUser: any = null;
    let foundUsernameOnly: any = null;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const docUser = (data.username || '').toString().trim();
      if (docUser.toLowerCase() === trimmedUser.toLowerCase()) {
        foundUsernameOnly = { id: doc.id, ...data };
        const storedPass = (data.password || '').toString();
        if (
          storedPass === rawPass ||
          storedPass === trimmedPass ||
          storedPass.trim() === trimmedPass
        ) {
          matchedUser = { id: doc.id, ...data };
        }
      }
    });

    // Check default seeded admin if collection doesn't have it
    if (!matchedUser && trimmedUser.toLowerCase() === 'admin') {
      if (trimmedPass === 'AdminPassword2026!') {
        matchedUser = {
          id: 'admin_default',
          username: 'admin',
          name: 'Super Administrator',
          isSuperAdmin: true,
        };
      } else {
        foundUsernameOnly = { username: 'admin' };
      }
    }

    if (matchedUser) {
      const session: SessionData = {
        userId: matchedUser.id || `user_${matchedUser.username}`,
        username: matchedUser.username,
        name: matchedUser.name || matchedUser.username,
        isSuperAdmin: Boolean(matchedUser.isSuperAdmin),
        projectIds: matchedUser.projectIds || [],
        projectRoles: matchedUser.projectRoles || {},
      };
      await setAuthSession(session);
      return { success: true, session };
    }

    if (foundUsernameOnly) {
      return {
        success: false,
        error: `Incorrect password for user "${foundUsernameOnly.username}". Please verify your password.`,
      };
    }

    return {
      success: false,
      error: `User "${trimmedUser}" not found. Please verify the username or sign in with Master Password.`,
    };
  } catch (err: any) {
    console.error('Server auth error:', err);
    return {
      success: false,
      error: err.message || 'Server authentication error.',
    };
  }
}

// Keep backward-compatible legacy login function
export async function login(password: string) {
  return loginWithMaster(password);
}
