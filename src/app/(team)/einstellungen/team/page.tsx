import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../brand";
import { listGroup, section, sectionTitle, teamPage } from "../../../ui";
import { AddMemberForm, MemberActions } from "./team-forms";

type Row = { id: string; name: string; email: string; role: "admin" | "member"; active: boolean };

export default async function TeamPage() {
  const supabase = await createClient();
  const { member } = await getMember(supabase);

  if (member?.role !== "admin") {
    return (
      <main className={teamPage}>
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
    <main className={teamPage}>
      <PageHeader heading="Team" />

      <section className={section}>
        <h2 className={sectionTitle}>Mitglied anlegen</h2>
        <AddMemberForm />
      </section>

      <section className={section}>
      <h2 className={sectionTitle}>Mitglieder</h2>
      <ul className={listGroup}>
        {(rows ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className={`min-w-0 flex-1 basis-48 ${row.active ? "" : "opacity-50"}`}>
              <div className="font-medium">
                {row.name} {row.role === "admin" && <span className="text-note font-normal text-muted">(Admin)</span>}
                {!row.active && <span className="text-note font-normal text-muted"> – deaktiviert</span>}
              </div>
              <div className="truncate text-note text-muted">{row.email}</div>
            </div>
            {row.id === member.id ? (
              <span className="text-note text-muted">Das bist du</span>
            ) : (
              <MemberActions id={row.id} active={row.active} role={row.role} />
            )}
          </li>
        ))}
      </ul>
      </section>
    </main>
  );
}
