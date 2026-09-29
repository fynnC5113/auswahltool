"use client";

// Buttons on /bewerbungen/[id] (variant A, Fynn 29.09.2026).
import { useActionState, useRef } from "react";
import { button, secondaryButton } from "../../../ui";
import { deleteApplicantAction, setConflictAction, setStatusAction } from "./actions";

type State = { error: string };
const empty: State = { error: "" };

function ErrorText({ state }: { state: State }) {
  return state.error ? <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p> : null;
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
      className="px-3 py-1.5 text-sm aria-pressed:bg-zinc-900 aria-pressed:font-semibold aria-pressed:text-white disabled:opacity-50 dark:aria-pressed:bg-zinc-100 dark:aria-pressed:text-zinc-900"
    >
      {label}
    </button>
  );
  return (
    <form action={action} className="flex flex-col gap-1">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">Status</span>
      <input type="hidden" name="id" value={id} />
      <div className="inline-flex self-start overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
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
        <button
          type="button"
          onClick={() => dialog.current?.showModal()}
          className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-700 dark:border-red-400 dark:text-red-400"
        >
          Bewerbung löschen
        </button>
      </div>
      <ErrorText state={state} />
      <dialog
        ref={dialog}
        aria-label="Löschen bestätigen"
        className="m-0 mt-auto w-full max-w-none rounded-t-xl bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:bg-zinc-950 dark:text-zinc-100 lg:m-auto lg:max-w-lg lg:rounded-xl"
      >
        <form action={action} className="flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <input type="hidden" name="id" value={id} />
          <h2 className="text-lg font-semibold">{name} endgültig löschen?</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Bewerbung, Antworten und Lebenslauf werden gelöscht. Das lässt sich nicht rückgängig machen.
            {booked && " Der Termin wird frei, die Gesprächsführer bekommen eine Absage."}
          </p>
          <div className="flex gap-2">
            <button disabled={pending} className={`${button} bg-red-700 dark:bg-red-500 dark:text-white`}>
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
