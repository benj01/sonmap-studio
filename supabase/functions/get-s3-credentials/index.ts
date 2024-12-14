import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "./_shared/cors.ts"
import { supabaseAdmin } from "./_shared/supabase.ts"

interface RequestBody {
  fileName: string
  projectId: string
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Parse the request body to get the filename and projectId
    const { fileName, projectId } = await req.json() as RequestBody
    
    if (!fileName) {
      return new Response(
        JSON.stringify({ error: "fileName is required" }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        }
      )
    }

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId is required" }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        }
      )
    }

    // Create the full path including the project ID
    const filePath = `${projectId}/${fileName}`

    // Use the storage API to get a signed URL which includes credentials
    // Added upsert: true to allow overwriting existing files
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('project-files')
      .createSignedUploadUrl(filePath, { upsert: true })

    if (signedUrlError) {
      console.error(signedUrlError)
      return new Response(
        JSON.stringify({ error: signedUrlError.message }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 500,
        }
      )
    }

    return new Response(
      JSON.stringify(signedUrlData),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    )
  }
})
