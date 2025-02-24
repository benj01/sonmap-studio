import { createPagesBrowserClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "@/types/supabase";

export const supabaseBrowserClient = createPagesBrowserClient<Database>({
  cookieOptions: {
    name: "sb-auth-token",
    secure: true,
    sameSite: "lax",
    path: "/"
  }
});
