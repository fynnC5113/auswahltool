// All team pages. The proxy already sends visitors without a session to
// /login; here the session is verified and membership checked (a deactivated
// member gets no row from team_members because of RLS).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { page, secondaryButton } from "../ui";
import { signOut } from "./actions";

export default async function TeamLayout({ children }: LayoutProps<"/">) {
  const { userId, member } = await getMember(await createClient());
  if (!userId) redirect("/login");

  const signOutButton = (
    <form action={signOut}>
      <button className={secondaryButton}>Abmelden</button>
    </form>
  );

  if (!member) {
    return (
      <main className={page}>
        <h1 className="mb-4 text-2xl font-semibold">Kein Zugang</h1>
        <p className="mb-6">Dein Zugang ist nicht (mehr) freigeschaltet. Bitte wende dich an einen Admin.</p>
        {signOutButton}
      </main>
    );
  }

  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Auswahltool
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/">Übersicht</Link>
            {member.role === "admin" && <Link href="/einstellungen/team">Team</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span>{member.name}</span>
            {signOutButton}
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
