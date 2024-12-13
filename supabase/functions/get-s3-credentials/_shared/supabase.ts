import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Database } from './types/supabase.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})