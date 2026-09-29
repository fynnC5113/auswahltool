// All team pages. The proxy already sends visitors without a session to
// /login; here the session is verified and membership checked (a deactivated
// member gets no row from team_members because of RLS).
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../brand";
import { smallButton, teamPage } from "../ui";
import { signOut } from "./actions";
import { TeamNav } from "./team-nav";

export default async function TeamLayout({ children }: LayoutProps<"/">) {
  const { userId, member } = await getMember(await createClient());
  if (!userId) redirect("/login");

  const signOutButton = (
    <form action={signOut}>
      <button className={smallButton}>Abmelden</button>
    </form>
  );

  if (!member) {
    return (
      <main className={teamPage}>
        <PageHeader heading="Kein Zugang">Dein Zugang ist nicht (mehr) freigeschaltet. Bitte wende dich an einen Admin.</PageHeader>
        <div>{signOutButton}</div>
      </main>
    );
  }

  return (
    <>
      <TeamNav role={member.role} name={member.name} />
      {/* Room for the bottom tab bar below lg. */}
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
    </>
  );
}
