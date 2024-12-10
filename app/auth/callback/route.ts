import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const redirect = requestUrl.searchParams.get("redirect");

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in`);
  }

  try {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Redirect to saved redirect path or dashboard
    return NextResponse.redirect(`${origin}${redirect || '/dashboard'}`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(`${origin}/sign-in?error=Auth session creation failed`);
  }
}