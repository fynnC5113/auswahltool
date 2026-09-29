"use client";

// Buttons on /bewerbungen/[id] (variant A, Fynn 29.09.2026).
import { useActionState, useRef } from "react";
import { dangerButton, dangerTextButton, dialog as dialogClass, dialogBody, fieldError, lead, readLabel, secondaryButton, sectionTitle } from "../../../ui";
import { deleteApplicantAction, setConflictAction, setStatusAction } from "./actions";

type State = { error: string };
const empty: State = { error: "" };

function ErrorText({ state }: { state: State }) {
  return state.error ? <p className={fieldError}>{state.error}</p> : null;
}

export function ConflictButton({ id, mine }: { id: string; mine: boolean }) {
  const [state, action, pending] = useActionState(setConflictAction, empty);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="conflicted" value={mine ? "0" : "1"} />
      <div>
        <button disabled={pending} className={secondaryButton}>
          {mine ? "Befangenheit entfernen" : "Ich bin befangen"}
        </button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

export function StatusSwitch({ id, status }: { id: string; status: "active" | "no_show" }) {
  const [state, action, pending] = useActionState(setStatusAction, empty);
  const option = (value: "active" | "no_show", label: string) => (
    <button
      name="status"
      value={value}
      disabled={pending}
      aria-pressed={status === value}
      className="h-9 rounded-[8px] px-3 text-note text-muted aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-fg aria-pressed:shadow-[0_1px_3px_rgba(0,0,0,0.12)] disabled:opacity-50"
    >
      {label}
    </button>
  );
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <span className={readLabel}>Status</span>
      <input type="hidden" name="id" value={id} />
      <div className="inline-flex gap-0.5 self-start rounded-field bg-field p-0.5">
        {option("active", "aktiv")}
        {option("no_show", "nicht erschienen")}
      </div>
      <ErrorText state={state} />
    </form>
  );
}

export function DeleteButton({ id, name, booked }: { id: string; name: string; booked: boolean }) {
  const [state, action, pending] = useActionState(deleteApplicantAction, empty);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div>
        <button type="button" onClick={() => dialog.current?.showModal()} className={dangerTextButton}>
          Bewerbung löschen
        </button>
      </div>
      <ErrorText state={state} />
      <dialog ref={dialog} aria-label="Löschen bestätigen" className={dialogClass}>
        <form action={action} className={dialogBody}>
          <input type="hidden" name="id" value={id} />
          <h2 className={sectionTitle}>{name} endgültig löschen?</h2>
          <p className={lead}>
            Bewerbung, Antworten und Lebenslauf werden gelöscht. Das lässt sich nicht rückgängig machen.
            {booked && " Der Termin wird frei, die Gesprächsführer bekommen eine Absage."}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button disabled={pending} className={dangerButton}>
              {pending ? "Lösche …" : "Endgültig löschen"}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>
              Abbrechen
            </button>
          </div>
          <ErrorText state={state} />
        </form>
      </dialog>
    </>
  );
}
