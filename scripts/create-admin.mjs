// Creates the first admin (Phase 5), against the database in the env file:
//   node --env-file=.env.local scripts/create-admin.mjs "Name" mail@example.org
import { createClient } from "@supabase/supabase-js";

const [name, rawEmail] = process.argv.slice(2);
if (!name || !rawEmail) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs "Name" mail@example.org');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();
const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
if (error || !data.user) {
  console.error(`createUser failed: ${error?.message}`);
  process.exit(1);
}
const insert = await db.from("team_members").insert({ id: data.user.id, email, name: name.trim(), role: "admin" });
if (insert.error) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error(`team_members insert failed: ${insert.error.message}`);
  process.exit(1);
}
console.log(`Admin created: ${name.trim()} <${email}> (${new URL(url).hostname})`);
