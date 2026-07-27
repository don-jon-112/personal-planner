import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // If the user is trying to access the login page, let them
  if (request.nextUrl.pathname === '/login') {
    return NextResponse.next()
  }

  // Check if they have the correct password cookie
  const password = request.cookies.get('site_password')?.value

  if (password !== process.env.SITE_PASSWORD) {
    // Redirect to login page if unauthorized
    return NextResponse.redirect(new URL('/login', request.url))
  }

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
