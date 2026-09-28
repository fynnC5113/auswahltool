import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { page } from "../../../ui";
import { AddMemberForm, MemberActions } from "./team-forms";

type Row = { id: string; name: string; email: string; role: "admin" | "member"; active: boolean };

export default async function TeamPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={page}>
        <p>Diese Seite ist nur für Admins.</p>
      </main>
    );
  }

  const { data: rows } = await supabase
    .from("team_members")
    .select("id, name, email, role, active")
    .order("active", { ascending: false })
    .order("name")
    .returns<Row[]>();

  return (
    <main className={page}>
      <h1 className="mb-6 text-2xl font-semibold">Team</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-medium">Mitglied anlegen</h2>
        <AddMemberForm />
      </section>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className={`min-w-0 flex-1 ${row.active ? "" : "opacity-50"}`}>
              <div className="font-medium">
                {row.name} {row.role === "admin" && <span className="text-sm font-normal">(Admin)</span>}
                {!row.active && <span className="text-sm font-normal"> – deaktiviert</span>}
              </div>
              <div className="truncate text-sm text-zinc-600 dark:text-zinc-400">{row.email}</div>
            </div>
            {row.id === member.id ? (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Das bist du</span>
            ) : (
              <MemberActions id={row.id} active={row.active} role={row.role} />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
