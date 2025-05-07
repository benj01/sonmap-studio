// utils/auth.ts
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { dbLogger } from '@/utils/logging/dbLogger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const errorMsg = 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.';
  // Log the error for observability
  dbLogger.error(errorMsg, { supabaseUrl, supabaseAnonKey }).catch(() => {});
  throw new Error(errorMsg);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
