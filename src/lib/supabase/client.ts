// Supabase client in the browser with the member's session (cookies), for
// Realtime on the board (Phase 17). Reads and writes still go through the
// server; RLS decides which changes this client receives.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
