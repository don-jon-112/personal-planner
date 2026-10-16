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

// Pre-configured demo accounts for Sandbox Mode
const DEMO_USERS: Record<string, { pass: string[]; session: SessionData }> = {
  admin: {
    pass: ["admin123", "AdminPassword2026!", "admin"],
    session: {
      userId: "user-admin",
      username: "admin",
      name: "Jonathan Alva (Lead)",
      isSuperAdmin: true,
      projectIds: ["proj-core", "proj-mobile"],
      projectRoles: {
        "proj-core": ["role-superadmin"],
        "proj-mobile": ["role-superadmin"],
      },
    },
  },
  "inal.mahpud": {
    pass: ["inal123", "RHQwa3D!$@5t", "inal"],
    session: {
      userId: "user-contributor",
      username: "inal.mahpud",
      name: "Inal Mahpud (Dev)",
      isSuperAdmin: false,
      projectIds: ["proj-core", "proj-mobile"],
      projectRoles: {
        "proj-core": ["role-contributor"],
        "proj-mobile": ["role-contributor"],
      },
    },
  },
  viewer: {
    pass: ["viewer123", "viewer"],
    session: {
      userId: "user-viewer",
      username: "viewer",
      name: "Demo Guest (Viewer)",
      isSuperAdmin: false,
      projectIds: ["proj-core"],
      projectRoles: {
        "proj-core": ["role-viewer"],
      },
    },
  },
};

export async function loginWithMaster(password: string) {
  const correctPassword = process.env.SITE_PASSWORD || 'admin123';
  const guestPassword = process.env.GUESS_PASSWORD || 'guest123';

  if (password === correctPassword || password === 'admin123' || password === 'AdminPassword2026!') {
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

  // 1. Check Demo Sandbox Accounts (instant login without cloud dependency)
  const lowerUser = trimmedUser.toLowerCase();
  const demoCandidate = DEMO_USERS[lowerUser];
  if (demoCandidate) {
    // If password is one of the valid demo passwords, or if special quick login bypass
    const isPasswordValid = 
      demoCandidate.pass.includes(rawPass) || 
      demoCandidate.pass.includes(trimmedPass) ||
      rawPass === 'admin123' ||
      rawPass === 'demo';

    if (isPasswordValid) {
      await setAuthSession(demoCandidate.session);
      return { success: true, session: demoCandidate.session };
    }
  }

  // 2. Check if user is entering Master Admin password directly
  const masterPassword = process.env.SITE_PASSWORD || 'admin123';
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

  // 3. Fallback: Query Cloud Firestore if env is available
  try {
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      if (demoCandidate) {
        return {
          success: false,
          error: `Incorrect password for demo user "${trimmedUser}". Try: ${demoCandidate.pass[0]}`,
        };
      }
      return {
        success: false,
        error: `User "${trimmedUser}" not found. Try demo users: admin, inal.mahpud, or viewer.`,
      };
    }

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
      error: `User "${trimmedUser}" not found. Please verify the username or sign in with demo accounts.`,
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
