import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
      const bucket = "project-files";
        const { data, error } = await supabaseAdmin.storage.getS3CredentialsForBucket(bucket);

        if (error) {
            console.error(error)
            return new Response(
                JSON.stringify({ error: error.message }),
                {
                    headers: { "Content-Type": "application/json", ...corsHeaders },
                    status: 500,
                }
            );
        }
      
      return new Response(
          JSON.stringify(data),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
      );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});