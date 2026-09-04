import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // If the user is trying to access the login page, let them
  if (request.nextUrl.pathname === '/login') {
    return NextResponse.next()
  }

  // Allow public access to /guest-timeline (share links) without password
  if (request.nextUrl.pathname.startsWith('/guest-timeline')) {
    return NextResponse.next()
  }

  // Check if they have the correct password cookie
  const password = request.cookies.get('site_password')?.value

  const isMasterPassword = password === process.env.SITE_PASSWORD
  const isGuestPassword = password === process.env.GUESS_PASSWORD

  if (isMasterPassword) {
    // Master has access to everything
    return NextResponse.next()
  }

  if (isGuestPassword) {
    // Guest only has access to /guest-timeline
    if (request.nextUrl.pathname.startsWith('/guest-timeline')) {
      return NextResponse.next()
    }
    // Redirect guest to their designated page if they try to access anything else
    return NextResponse.redirect(new URL('/guest-timeline', request.url))
  }

  // Redirect to login page if unauthorized
  return NextResponse.redirect(new URL('/login', request.url))

  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
