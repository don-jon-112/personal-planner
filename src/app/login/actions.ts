'use server'

import { cookies } from 'next/headers'
import { getPostgresSql, ensureTableExists } from '@/lib/postgres-server'

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

export async function authenticateUser(
  username: string,
  password: string,
  dbOptions?: { provider?: string; customUrl?: string }
) {
  const trimmedUser = (username || '').trim();
  const rawPass = password || '';
  const trimmedPass = (password || '').trim();

  if (!trimmedUser) {
    return { success: false, error: 'Username is required' };
  }

  // 1. Check if user is logging in as admin with Master Admin password
  const masterPassword = process.env.SITE_PASSWORD;
  if (
    masterPassword &&
    (trimmedUser.toLowerCase() === 'admin' || trimmedUser.toLowerCase() === 'master_admin') &&
    (rawPass === masterPassword || trimmedPass === masterPassword)
  ) {
    const session: SessionData = {
      userId: 'master_admin',
      username: 'admin',
      name: 'Master Admin',
      isSuperAdmin: true,
    };
    await setAuthSession(session);
    return { success: true, session };
  }

  const cookieStore = await cookies();
  const cookieProvider = cookieStore.get('active_db_provider')?.value;
  const cookieCustomUrl = cookieStore.get('custom_postgres_url')?.value
    ? decodeURIComponent(cookieStore.get('custom_postgres_url')!.value)
    : undefined;

  const targetProvider =
    dbOptions?.provider || cookieProvider || process.env.NEXT_PUBLIC_DB_PROVIDER || 'firebase';
  const customPostgresUrl =
    dbOptions?.customUrl || cookieCustomUrl || process.env.DATABASE_URL || undefined;

  let matchedUser: any = null;
  let foundUsernameOnly: any = null;

  // 2. Query PostgreSQL users table if postgres mode is active or custom URL is present
  if (targetProvider === 'postgres' || customPostgresUrl) {
    try {
      const sql = getPostgresSql(customPostgresUrl);
      await ensureTableExists(sql, 'users');
      const rows = await sql`
        SELECT id, project_id, data FROM users
        ORDER BY updated_at DESC
      `;

      for (const r of rows) {
        const data = typeof r.data === 'object' && r.data !== null ? r.data : {};
        const docUser = (data.username || '').toString().trim();
        if (docUser.toLowerCase() === trimmedUser.toLowerCase()) {
          foundUsernameOnly = { id: r.id, ...data };
          const storedPass = (data.password || '').toString();
          if (
            storedPass === rawPass ||
            storedPass === trimmedPass ||
            storedPass.trim() === trimmedPass
          ) {
            matchedUser = { id: r.id, ...data };
            break;
          }
        }
      }
    } catch (pgErr) {
      console.warn('PostgreSQL server auth check encountered error, trying fallback:', pgErr);
    }
  }

  // 3. Fallback / Query Firestore Cloud users collection
  if (!matchedUser) {
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
    } catch (fbErr) {
      console.warn('Firebase server auth check encountered error:', fbErr);
    }
  }

  // 4. Check default seeded admin if collection doesn't have it
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
}

// Keep backward-compatible legacy login function
export async function login(password: string) {
  return loginWithMaster(password);
}

export async function updateUserPassword(
  userId: string,
  username: string,
  currentPassword: string,
  newPassword: string,
  dbOptions?: { provider?: string; customUrl?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedUser = (username || '').trim();
    const curPass = (currentPassword || '').trim();
    const newPass = (newPassword || '').trim();

    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'Password baru minimal harus 6 karakter.' };
    }

    if (curPass === newPass) {
      return { success: false, error: 'Password baru tidak boleh sama dengan password lama.' };
    }

    const cookieStore = await cookies();
    const cookieProvider = cookieStore.get('active_db_provider')?.value;
    const cookieCustomUrl = cookieStore.get('custom_postgres_url')?.value
      ? decodeURIComponent(cookieStore.get('custom_postgres_url')!.value)
      : undefined;

    const targetProvider =
      dbOptions?.provider || cookieProvider || process.env.NEXT_PUBLIC_DB_PROVIDER || 'firebase';
    const customPostgresUrl =
      dbOptions?.customUrl || cookieCustomUrl || process.env.DATABASE_URL || undefined;

    // 1. If PostgreSQL mode is active, update in PostgreSQL
    if (targetProvider === 'postgres' || customPostgresUrl) {
      try {
        const sql = getPostgresSql(customPostgresUrl);
        await ensureTableExists(sql, 'users');

        const rows = await sql`
          SELECT id, project_id, data FROM users
          ORDER BY updated_at DESC
        `;

        let targetRow = rows.find((r) => r.id === userId);
        if (!targetRow) {
          targetRow = rows.find(
            (r) => ((r.data as any)?.username || '').toLowerCase() === trimmedUser.toLowerCase()
          );
        }

        if (targetRow) {
          const userData = (targetRow.data || {}) as any;
          const storedPass = (userData.password || '').toString();

          const masterPassword = process.env.SITE_PASSWORD;
          const isMasterOverride = masterPassword && curPass === masterPassword;
          const isPasswordCorrect =
            storedPass === curPass || storedPass.trim() === curPass || isMasterOverride;

          if (!isPasswordCorrect) {
            return { success: false, error: 'Password lama (current password) tidak sesuai.' };
          }

          const updatedData = { ...userData, password: newPass };
          await sql`
            UPDATE users
            SET data = ${sql.json(updatedData)}, updated_at = NOW()
            WHERE id = ${targetRow.id}
          `;

          return { success: true };
        }
      } catch (pgErr) {
        console.warn('PostgreSQL password update failed, checking Firebase fallback:', pgErr);
      }
    }

    // 2. Firebase Firestore update fallback
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, getDoc, updateDoc, collection, getDocs, serverTimestamp } = await import('firebase/firestore');

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

    let userDocRef = userId && userId !== 'master_admin' ? doc(db, 'users', userId) : null;
    let userSnap = userDocRef ? await getDoc(userDocRef) : null;

    if (!userSnap || !userSnap.exists()) {
      const snap = await getDocs(collection(db, 'users'));
      snap.forEach((d) => {
        const data = d.data();
        if ((data.username || '').toLowerCase() === trimmedUser.toLowerCase()) {
          userDocRef = doc(db, 'users', d.id);
          userSnap = d as any;
        }
      });
    }

    if (!userSnap || !userSnap.exists()) {
      return { success: false, error: `User "${trimmedUser}" tidak ditemukan di database.` };
    }

    const userData = userSnap.data();
    const storedPass = (userData.password || '').toString();

    const masterPassword = process.env.SITE_PASSWORD;
    const isMasterOverride = masterPassword && curPass === masterPassword;
    const isPasswordCorrect =
      storedPass === curPass || storedPass.trim() === curPass || isMasterOverride;

    if (!isPasswordCorrect) {
      return { success: false, error: 'Password lama (current password) tidak sesuai.' };
    }

    if (userDocRef) {
      await updateDoc(userDocRef, {
        password: newPass,
        updatedAt: serverTimestamp(),
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Update password server error:', err);
    return { success: false, error: err.message || 'Gagal mengubah password.' };
  }
}
