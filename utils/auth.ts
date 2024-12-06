// utils/auth.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function getUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Error fetching user:", error.message);
    return null;
  }
  return user; // Return null if not logged in
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error.message);
  }
}
