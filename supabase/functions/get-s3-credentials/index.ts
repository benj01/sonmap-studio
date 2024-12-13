import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use the storage API to get a signed URL which includes credentials
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('project-files')
      .createSignedUploadUrl('temp-credential-check.txt');

    if (signedUrlError) {
      console.error(signedUrlError);
      return new Response(
        JSON.stringify({ error: signedUrlError.message }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify(signedUrlData),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});