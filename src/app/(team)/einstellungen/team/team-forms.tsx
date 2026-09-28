"use client";

import { useActionState, useRef, useEffect } from "react";
import { button, input, secondaryButton } from "../../../ui";
import { addMemberAction, setActiveAction, setRoleAction } from "./actions";

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(addMemberAction, { error: "" });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state.error) form.current?.reset();
  }, [pending, state]);

  return (
    <form ref={form} action={formAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <label className="flex flex-col gap-1">
        Name
        <input name="name" required className={input} />
      </label>
      <label className="flex flex-col gap-1">
        Mailadresse
        <input name="email" type="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1">
        Rolle
        <select name="role" defaultValue="member" className={input}>
          <option value="member">Mitglied</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button disabled={pending} className={button}>
        Anlegen
      </button>
      {state.error && <p className="text-red-700 sm:col-span-4">{state.error}</p>}
    </form>
  );
}

export function MemberActions({ id, active, role }: { id: string; active: boolean; role: "admin" | "member" }) {
  const [activeState, activeAction, activePending] = useActionState(setActiveAction, { error: "" });
  const [roleState, roleAction, rolePending] = useActionState(setRoleAction, { error: "" });
  const error = activeState.error || roleState.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={roleAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="role" value={role === "admin" ? "member" : "admin"} />
          <button disabled={rolePending} className={secondaryButton}>
            {role === "admin" ? "Admin entziehen" : "Zum Admin machen"}
          </button>
        </form>
        <form action={activeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={String(!active)} />
          <button disabled={activePending} className={secondaryButton}>
            {active ? "Deaktivieren" : "Reaktivieren"}
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
