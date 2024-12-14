import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Database } from './types/supabase.ts'

// Use NEXT_PUBLIC_SUPABASE_URL instead of SUPABASE_URL
const supabaseUrl = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})
