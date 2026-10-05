'use server'

import { cookies } from 'next/headers'

export interface SessionData {
  userId: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
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

// Keep backward-compatible legacy login function
export async function login(password: string) {
  return loginWithMaster(password);
}
