// The applicant's own CV: a signed link valid for 60 seconds, made on click.
import { cvLink } from "@/lib/application";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = await cvLink(createAdminClient(), token);
  if (!url) return new Response("Nicht gefunden", { status: 404 });
  return Response.redirect(url, 303);
}
