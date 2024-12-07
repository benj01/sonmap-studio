import { type NextRequest, NextResponse } from "next/server";
import { createClient } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request)

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  // Protected routes that require authentication
  const protectedPaths = ['/settings', '/profile']
  const path = request.nextUrl.pathname

  if (protectedPaths.includes(path)) {
    if (!session) {
      // Redirect to login if accessing protected route without session
      return NextResponse.redirect(new URL('/sign-in', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}