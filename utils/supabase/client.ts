import { createBrowserClient } from "@supabase/ssr";

// Create a singleton instance
const supabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Export the singleton instance
export const getClient = () => supabaseClient;
