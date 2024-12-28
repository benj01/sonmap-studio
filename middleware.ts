import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Protected routes that require authentication
const PROTECTED_ROUTES = [
  '/settings',
  '/profile',
  '/dashboard',
  '/notes',
  '/protected',
  '/projects/new',
];

// Public routes that should redirect to dashboard if authenticated
const AUTH_ROUTES = [
  '/sign-in',
  '/sign-up',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Initialize Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value || '',
        set: (name: string, value: string, options: any) => {
          const response = NextResponse.next();
          response.cookies.set(name, value, options);
          return response;
        },
        remove: (name: string, options: any) => {
          const response = NextResponse.next();
          response.cookies.delete(name, options);
          return response;
        },
      },
    }
  );

  // Retrieve the current session
  const { data: { session } } = await supabase.auth.getSession();

  // Redirect unauthenticated users trying to access protected routes
  if (!session && PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const redirectUrl = new URL('/sign-in', request.url);
    redirectUrl.searchParams.set('redirect', pathname); // Add redirect path for post-login navigation
    return NextResponse.redirect(redirectUrl);
  }

  // Redirect authenticated users away from auth routes
  if (session && AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Allow all other routes to proceed
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)",
  ],
};
