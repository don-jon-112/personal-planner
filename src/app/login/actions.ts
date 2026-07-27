'use server'

import { cookies } from 'next/headers'

export async function login(password: string) {
  const correctPassword = process.env.SITE_PASSWORD

  if (password === correctPassword) {
    const cookieStore = await cookies()
    cookieStore.set('site_password', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    })
    return { success: true }
  } else {
    return { success: false, error: 'Incorrect password' }
  }
}
