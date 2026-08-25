import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// IMPORTANT: this uses the service role key and must only ever be imported
// from server-only files (server actions, route handlers). Never import
// this into a "use client" component.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
