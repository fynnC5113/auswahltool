// CV for team members: a signed link valid for 60 seconds, made on click.
// The proxy sends visitors without a session to /login; RLS decides the rest.
import { cvUrl } from "@/lib/applicant-team";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = await cvUrl(await createClient(), id);
  if (!url) return new Response("Nicht gefunden", { status: 404 });
  return Response.redirect(url, 303);
}
