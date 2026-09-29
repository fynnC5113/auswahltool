"use client";

import { useActionState, useRef, useEffect } from "react";
import { barButton, fieldError, fieldLabel, formGroup, input, select, smallButton } from "../../../ui";
import { addMemberAction, setActiveAction, setRoleAction } from "./actions";

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState(addMemberAction, { error: "" });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state.error) form.current?.reset();
  }, [pending, state]);

  return (
    <form ref={form} action={formAction} className={`${formGroup} sm:grid sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end`}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={fieldLabel}>Name</span>
        <input name="name" required className={input} />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className={fieldLabel}>Mailadresse</span>
        <input name="email" type="email" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={fieldLabel}>Rolle</span>
        <select name="role" defaultValue="member" className={select}>
          <option value="member">Mitglied</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button disabled={pending} className={`${barButton} h-[46px]`}>
        Anlegen
      </button>
      {state.error && <p className={`${fieldError} sm:col-span-4`}>{state.error}</p>}
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
          <button disabled={rolePending} className={smallButton}>
            {role === "admin" ? "Admin entziehen" : "Zum Admin machen"}
          </button>
        </form>
        <form action={activeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={String(!active)} />
          <button disabled={activePending} className={smallButton}>
            {active ? "Deaktivieren" : "Reaktivieren"}
          </button>
        </form>
      </div>
      {error && <p className={fieldError}>{error}</p>}
    </div>
  );
}
