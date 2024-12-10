import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Protected routes that require authentication
const PROTECTED_ROUTES = [
  '/settings',
  '/profile',
  '/dashboard',
  '/notes',
  '/protected',
  '/projects/new'
];

// Public routes that should redirect to dashboard if authenticated
const AUTH_ROUTES = [
  '/sign-in',
  '/sign-up'
];

export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next({  // Changed from const to let
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            request.cookies.set({
              name,
              value,
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value,
              ...options,
            })
          },
          remove(name: string, options: any) {
            request.cookies.set({
              name,
              value: '',
              ...options,
            })
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })
            response.cookies.set({
              name,
              value: '',
              ...options,
            })
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    const path = request.nextUrl.pathname

    // Redirect authenticated users away from auth pages
    if (session && AUTH_ROUTES.some(route => path.startsWith(route))) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Redirect unauthenticated users to sign-in for protected routes
    if (!session && PROTECTED_ROUTES.some(route => path.startsWith(route))) {
      const redirectUrl = new URL('/sign-in', request.url)
      redirectUrl.searchParams.set('redirect', path)
      return NextResponse.redirect(redirectUrl)
    }

    console.log('Middleware: Checking route:', request.nextUrl.pathname)

    return response
  } catch (e) {
    console.error('Middleware error:', e)
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}