"use client";

// Slot list for /terminplanung (variant B, Fynn 29.09.2026): one quiet row per
// slot, tapping it opens a <dialog> with every action for that slot.
import { useActionState, useEffect, useRef, useState } from "react";
import { button, input, secondaryButton } from "../../ui";
import {
  assignApplicantAction,
  deleteFreeSlotsAction,
  deleteSlotAction,
  generateSlotsAction,
  saveSlotAction,
  setPairAction,
  setPreferredAction,
  unassignApplicantAction,
} from "./actions";

type State = { error: string; message?: string };
const empty: State = { error: "" };

export type BoardSlot = {
  id: string;
  day: string;
  time: string;
  end: string;
  /** datetime-local value (Berlin). */
  local: string;
  locationId: string;
  location: string;
  interviewerA: string | null;
  interviewerB: string | null;
  pair: string | null;
  applicant: string | null;
  bookable: boolean;
  hints: string[];
};

export type Option = { id: string; name: string };
export type MemberOption = Option & { active: boolean };

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function SlotToolbar({
  roundId,
  hasFree,
  onAdd,
}: {
  roundId: string;
  hasFree: boolean;
  onAdd: () => void;
}) {
  const [generated, generate, generating] = useActionState(generateSlotsAction, empty);
  const [deleted, deleteFree, deleting] = useActionState(deleteFreeSlotsAction, empty);
  const error = generated.error || deleted.error;

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={generate}>
          <input type="hidden" name="roundId" value={roundId} />
          <button disabled={generating} className={button}>
            {generating ? "Erzeuge …" : "Alle möglichen Termine erzeugen"}
          </button>
        </form>
        <button type="button" onClick={onAdd} className={secondaryButton}>
          Termin anlegen
        </button>
        {hasFree && (
          <form
            action={deleteFree}
            onSubmit={(e) => {
              if (!confirm("Alle freien Termine löschen? Gebuchte Termine bleiben.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="roundId" value={roundId} />
            <button disabled={deleting} className={secondaryButton}>
              Alle freien Termine löschen
            </button>
          </form>
        )}
      </div>
      {generated.message && !generating && <p className="text-sm text-zinc-600 dark:text-zinc-400">{generated.message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferred toggle
// ---------------------------------------------------------------------------

export function PreferredToggle({ roundId, memberId, preferred }: { roundId: string; memberId: string; preferred: boolean }) {
  const [state, formAction, pending] = useActionState(setPreferredAction, empty);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="preferred" value={String(!preferred)} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={preferred}
          disabled={pending}
          onChange={() => form.current?.requestSubmit()}
          className="h-4 w-4"
        />
        bevorzugt
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// List + dialog
// ---------------------------------------------------------------------------

type Props = {
  roundId: string;
  slots: BoardSlot[];
  members: MemberOption[];
  locations: Option[];
  /** Applicants without a slot. */
  applicants: Option[];
  /** datetime-local default for a new slot. */
  newSlotDefault: string;
};

export function SlotBoard({ roundId, slots, members, locations, applicants, newSlotDefault }: Props) {
  // null = closed, "new" = new slot, otherwise a slot id.
  const [open, setOpen] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const slot = open && open !== "new" ? slots.find((s) => s.id === open) : undefined;
  // A slot that vanished (deleted, or gone after a refresh) closes the dialog.
  const shown = open === "new" || slot ? open : null;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (shown && !d.open) d.showModal();
    if (!shown && d.open) d.close();
  }, [shown]);

  const days = new Map<string, BoardSlot[]>();
  for (const s of slots) days.set(s.day, [...(days.get(s.day) ?? []), s]);

  return (
    <>
      <SlotToolbar roundId={roundId} hasFree={slots.some((s) => !s.applicant)} onAdd={() => setOpen("new")} />

      {slots.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Noch keine Termine. Sobald das Team seine Verfügbarkeit eingetragen hat: „Alle möglichen Termine erzeugen“.
        </p>
      )}

      {[...days].map(([day, list]) => (
        <div key={day} className="mb-6">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{day}</h3>
          <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {list.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  className="grid w-full grid-cols-[3.5rem_1fr_auto] items-start gap-x-3 gap-y-1 px-1 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="font-semibold tabular-nums">{s.time}</span>
                  <span className="min-w-0 text-sm text-zinc-600 dark:text-zinc-400">
                    {s.location}
                    {s.applicant && (
                      <>
                        {" · "}
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{s.applicant}</span>
                        {s.pair && ` · ${s.pair}`}
                      </>
                    )}
                  </span>
                  <StatusPill slot={s} />
                  {s.hints.length > 0 && (
                    <span className="col-start-2 col-end-4 text-sm text-amber-800 dark:text-amber-300">
                      ⚠ {s.hints.length === 1 ? s.hints[0] : `${s.hints.length} Hinweise`}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          // A click on the backdrop closes.
          if (e.target === dialog.current) setOpen(null);
        }}
        className="m-0 mt-auto w-full max-w-none rounded-t-xl bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:bg-zinc-950 dark:text-zinc-100 lg:m-auto lg:max-w-lg lg:rounded-xl"
      >
        <div className="max-h-[85vh] overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {shown === "new" && (
            <>
              <DialogHeader title="Termin anlegen" onClose={() => setOpen(null)} />
              <SlotForm
                key="new"
                roundId={roundId}
                locations={locations}
                members={members}
                defaults={{ local: newSlotDefault, locationId: locations[0]?.id ?? "", interviewerA: null, interviewerB: null }}
                onDone={() => setOpen(null)}
              />
            </>
          )}
          {slot && (
            <SlotDetails
              key={slot.id}
              roundId={roundId}
              slot={slot}
              members={members}
              locations={locations}
              applicants={applicants}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      </dialog>
    </>
  );
}

function StatusPill({ slot }: { slot: BoardSlot }) {
  const base = "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium";
  if (slot.applicant) return <span className={`${base} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>gebucht</span>;
  if (slot.bookable) return <span className={`${base} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>frei</span>;
  return <span className={`${base} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`}>nicht buchbar</span>;
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button type="button" onClick={onClose} className={secondaryButton}>
        Schließen
      </button>
    </div>
  );
}

function SlotDetails({
  roundId,
  slot,
  members,
  locations,
  applicants,
  onClose,
}: {
  roundId: string;
  slot: BoardSlot;
  members: MemberOption[];
  locations: Option[];
  applicants: Option[];
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader title={`${slot.day} ${slot.time}–${slot.end} · ${slot.location}`} onClose={onClose} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill slot={slot} />
          {slot.applicant && (
            <span>
              Bewerber: <strong>{slot.applicant}</strong>
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{slot.pair ?? "Das Paar wählt das Tool bei der Buchung."}</p>
        {slot.hints.map((h) => (
          <p key={h} className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {h}
          </p>
        ))}
      </div>

      {slot.applicant ? (
        <>
          <PairForm slot={slot} members={members} />
          <UnassignForm slot={slot} />
        </>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">Bewerber eintragen</h3>
            <AssignForm slot={slot} applicants={applicants} />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="font-medium">Termin ändern</h3>
            <SlotForm
              roundId={roundId}
              id={slot.id}
              locations={locations}
              members={members}
              defaults={{ local: slot.local, locationId: slot.locationId, interviewerA: slot.interviewerA, interviewerB: slot.interviewerB }}
            />
          </section>
          <DeleteForm slot={slot} onDone={onClose} />
        </>
      )}
    </div>
  );
}

function PairSelects({ members, a, b, required }: { members: MemberOption[]; a: string | null; b: string | null; required: boolean }) {
  const options = (selected: string | null) => (
    <>
      <option value="">{required ? "– wählen –" : "bei der Buchung wählen"}</option>
      {members
        .filter((m) => m.active || m.id === selected)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.active ? "" : " (deaktiviert)"}
          </option>
        ))}
    </>
  );
  return (
    <>
      <label className="flex flex-col gap-1 text-sm">
        Gesprächsführer 1
        <select name="interviewerA" defaultValue={a ?? ""} className={input}>
          {options(a)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Gesprächsführer 2
        <select name="interviewerB" defaultValue={b ?? ""} className={input}>
          {options(b)}
        </select>
      </label>
    </>
  );
}

function SlotForm({
  roundId,
  id,
  locations,
  members,
  defaults,
  onDone,
}: {
  roundId: string;
  id?: string;
  locations: Option[];
  members: MemberOption[];
  defaults: { local: string; locationId: string; interviewerA: string | null; interviewerB: string | null };
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(async (prev: State, formData: FormData) => {
    const result = await saveSlotAction(prev, formData);
    if (!result.error) onDone?.();
    return result.error ? result : { error: "", message: "Gespeichert." };
  }, empty);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="roundId" value={roundId} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="flex flex-col gap-1 text-sm">
        Beginn
        <input name="startsAt" type="datetime-local" step={900} required defaultValue={defaults.local} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Ort
        <select name="locationId" defaultValue={defaults.locationId} className={input}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <PairSelects members={members} a={defaults.interviewerA} b={defaults.interviewerB} required={false} />
      <div className="sm:col-span-2">
        <button disabled={pending} className={button}>
          {id ? "Speichern" : "Anlegen"}
        </button>
        {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
        {state.message && !pending && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>}
      </div>
    </form>
  );
}

function PairForm({ slot, members }: { slot: BoardSlot; members: MemberOption[] }) {
  const [state, formAction, pending] = useActionState(async (prev: State, formData: FormData) => {
    const result = await setPairAction(prev, formData);
    return result.error ? result : { error: "", message: "Paar gespeichert." };
  }, empty);
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <h3 className="font-medium sm:col-span-2">Paar ändern</h3>
      <input type="hidden" name="id" value={slot.id} />
      <PairSelects members={members} a={slot.interviewerA} b={slot.interviewerB} required />
      <div className="sm:col-span-2">
        <button disabled={pending} className={button}>
          Paar speichern
        </button>
        {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
        {state.message && !pending && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>}
      </div>
    </form>
  );
}

function AssignForm({ slot, applicants }: { slot: BoardSlot; applicants: Option[] }) {
  const [state, formAction, pending] = useActionState(assignApplicantAction, empty);
  if (!applicants.length) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Alle Bewerber haben schon einen Termin.</p>;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={slot.id} />
      <div className="flex flex-wrap gap-2">
        <select name="applicantId" required defaultValue="" aria-label="Bewerber" className={`${input} min-w-0 flex-1`}>
          <option value="" disabled>
            Bewerber wählen …
          </option>
          {applicants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button disabled={pending} className={button}>
          Eintragen
        </button>
      </div>
      {!slot.pair && <p className="text-sm text-zinc-600 dark:text-zinc-400">Das Tool wählt dabei das Paar; ändern kannst du es danach.</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

function UnassignForm({ slot }: { slot: BoardSlot }) {
  const [state, formAction, pending] = useActionState(unassignApplicantAction, empty);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`${slot.applicant} austragen? Der Termin wird wieder frei, das Paar wird beim nächsten Buchen neu gewählt.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={slot.id} />
      <button disabled={pending} className={secondaryButton}>
        Bewerber austragen
      </button>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

function DeleteForm({ slot, onDone }: { slot: BoardSlot; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(async (prev: State, formData: FormData) => {
    const result = await deleteSlotAction(prev, formData);
    if (!result.error) onDone();
    return result;
  }, empty);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={slot.id} />
      <button disabled={pending} className={secondaryButton}>
        Termin löschen
      </button>
      {state.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
