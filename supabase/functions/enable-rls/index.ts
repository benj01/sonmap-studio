// D:\HE\GitHub\sonmap-studio\supabase\functions\enable-rls\index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
    const supabaseUrl = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase URL or Anon Key not found' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
    );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        const { data, error } = await supabase.rpc('enable_rls_on_spatial_ref_sys');

        if (error) {
            console.error('Error enabling RLS:', error);
             return new Response(
                JSON.stringify({ error: 'Error enabling RLS', details: error }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        } else {
            console.log('RLS enabled successfully:', data); // data will be null
           return new Response(
                JSON.stringify({ message: 'RLS enabled successfully' }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
    } catch (err) {
        console.error('Unexpected error:', err);
       return new Response(
            JSON.stringify({ error: 'Unexpected error', details: err }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});