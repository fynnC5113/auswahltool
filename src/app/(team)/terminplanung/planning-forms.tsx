"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { button, input, secondaryButton } from "../../ui";
import {
  addBlockedTimeAction,
  addLocationAction,
  deleteBlockedTimeAction,
  deleteLocationAction,
  renameLocationAction,
  setDefaultLocationAction,
} from "./actions";

const empty = { error: "" };

/** With a suggestion: a single button that creates the first location. */
export function AddLocationForm({ roundId, suggestion }: { roundId: string; suggestion?: string }) {
  const [state, formAction, pending] = useActionState(addLocationAction, empty);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state.error) form.current?.reset();
  }, [pending, state]);

  return (
    <form ref={form} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="roundId" value={roundId} />
      {suggestion ? (
        <>
          <input type="hidden" name="name" value={suggestion} />
          <button disabled={pending} className={button}>
            {suggestion} als Standardort anlegen
          </button>
        </>
      ) : (
        <>
          <label className="flex flex-1 flex-col gap-1">
            Weiterer Ort
            <input name="name" required className={input} />
          </label>
          <button disabled={pending} className={button}>
            Anlegen
          </button>
        </>
      )}
      {state.error && <p className="w-full text-red-700">{state.error}</p>}
    </form>
  );
}

export function LocationActions({ id, name, isDefault }: { id: string; name: string; isDefault: boolean }) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction, renamePending] = useActionState(async (prev: typeof empty, formData: FormData) => {
    const result = await renameLocationAction(prev, formData);
    if (!result.error) setEditing(false);
    return result;
  }, empty);
  const [defaultState, defaultAction, defaultPending] = useActionState(setDefaultLocationAction, empty);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteLocationAction, empty);
  const error = renameState.error || defaultState.error || deleteState.error;

  return (
    <div className="flex flex-col gap-1">
      {editing ? (
        <form action={renameAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input name="name" defaultValue={name} required autoFocus className={`${input} max-w-xs flex-1`} />
          <button disabled={renamePending} className={secondaryButton}>
            Speichern
          </button>
          <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
            Abbrechen
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 font-medium">
            {name} {isDefault && <span className="text-sm font-normal">(Standard)</span>}
          </span>
          <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
            Umbenennen
          </button>
          {!isDefault && (
            <form action={defaultAction}>
              <input type="hidden" name="id" value={id} />
              <button disabled={defaultPending} className={secondaryButton}>
                Als Standard
              </button>
            </form>
          )}
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`Ort „${name}“ mit seinen Sperrzeiten löschen?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <button disabled={deletePending} className={secondaryButton}>
              Löschen
            </button>
          </form>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function AddBlockedTimeForm({ locations, defaultDay }: { locations: { id: string; name: string }[]; defaultDay: string }) {
  const [state, formAction, pending] = useActionState(addBlockedTimeAction, empty);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pending && !state.error) form.current?.reset();
  }, [pending, state]);

  return (
    <form ref={form} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        Ort
        <select name="locationId" className={input}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Notiz (optional)
        <input name="note" placeholder="z. B. Beratung" className={input} />
      </label>
      <label className="flex flex-col gap-1">
        Beginn
        <input name="startsAt" type="datetime-local" step={900} required defaultValue={`${defaultDay}T10:00`} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        Ende
        <input name="endsAt" type="datetime-local" step={900} required defaultValue={`${defaultDay}T12:00`} className={input} />
      </label>
      <div className="sm:col-span-2">
        <button disabled={pending} className={button}>
          Sperrzeit eintragen
        </button>
        {state.error && <p className="mt-2 text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}

export function DeleteBlockedTimeButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteBlockedTimeAction, empty);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={secondaryButton}>
        Löschen
      </button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
