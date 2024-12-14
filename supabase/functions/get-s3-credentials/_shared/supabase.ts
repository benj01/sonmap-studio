import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Database } from './types/supabase.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const s3AccessKey = Deno.env.get('S3_ACCESS_KEY')!
const s3SecretKey = Deno.env.get('S3_SECRET_KEY')!

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  global: {
    headers: {
      'x-s3-access-key': s3AccessKey,
      'x-s3-secret-key': s3SecretKey
    }
  }
})
