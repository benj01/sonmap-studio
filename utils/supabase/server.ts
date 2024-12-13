import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase';


export function createSupabaseServerClient() {
    const cookieStore = cookies()

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    cookieStore.set({name, value, ...options})
                },
                remove(name: string, options: CookieOptions) {
                    cookieStore.delete({name, ...options})
                },
            },
        }
    )
}


export async function getSupabaseStorageS3Credentials() {
    const supabase = createSupabaseServerClient()
    try {
        const { data, error } = await supabase.functions.invoke('get-s3-credentials', {
            method: 'POST',
        })
        if (error) {
            console.error('Error fetching S3 credentials:', error);
            return null
        }
        return data;
    } catch (error) {
        console.error('Error fetching S3 credentials:', error);
        return null
    }
}