"use client";

// Admin buttons around feedback (Phase 14): "Sperre aufheben" and
// "Auswahlrunde starten" and "Auswahlrunde zurücknehmen", each with a confirmation.
import { useActionState, useRef } from "react";
import { button, dialog as dialogClass, dialogBody, fieldError, lead, secondaryButton, sectionTitle, smallButton, textButton } from "../ui";
import { liftSightLockAction, startSelectionAction, stopSelectionAction } from "./feedback-actions";

type State = { error: string };
const empty: State = { error: "" };

export function LiftButton({ applicantId }: { applicantId: string }) {
  const [state, action, pending] = useActionState(liftSightLockAction, empty);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={applicantId} />
      <button disabled={pending} className={smallButton}>
        Sperre aufheben
      </button>
      {state.error && <p className={fieldError}>{state.error}</p>}
    </form>
  );
}

export function StartSelectionButton({ roundId, missing }: { roundId: string; missing: number }) {
  const [state, action, pending] = useActionState(startSelectionAction, empty);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div>
        <button type="button" onClick={() => dialog.current?.showModal()} className={secondaryButton}>
          Auswahlrunde starten
        </button>
      </div>
      {state.error && <p className={fieldError}>{state.error}</p>}
      <dialog ref={dialog} aria-label="Auswahlrunde starten" className={dialogClass}>
        <form action={action} className={dialogBody}>
          <input type="hidden" name="roundId" value={roundId} />
          <h2 className={sectionTitle}>Auswahlrunde starten?</h2>
          <p className={lead}>
            {missing > 0 && (
              <>
                Noch{" "}
                <strong className="font-semibold text-fg">
                  {missing} {missing === 1 ? "Feedback fehlt" : "Feedbacks fehlen"}
                </strong>
                .{" "}
              </>
            )}
            Nach dem Start sieht jedes Mitglied alle abgegebenen Feedbacks, auch wo der Partner noch nicht abgegeben hat.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button disabled={pending} className={button}>
              {pending ? "Starte …" : "Auswahlrunde starten"}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>
              Abbrechen
            </button>
          </div>
          {state.error && <p className={fieldError}>{state.error}</p>}
        </form>
      </dialog>
    </>
  );
}

export function StopSelectionButton({ roundId }: { roundId: string }) {
  const [state, action, pending] = useActionState(stopSelectionAction, empty);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div>
        <button type="button" onClick={() => dialog.current?.showModal()} className={textButton}>
          Auswahlrunde zurücknehmen
        </button>
      </div>
      {state.error && <p className={fieldError}>{state.error}</p>}
      <dialog ref={dialog} aria-label="Auswahlrunde zurücknehmen" className={dialogClass}>
        <form action={action} className={dialogBody}>
          <input type="hidden" name="roundId" value={roundId} />
          <h2 className={sectionTitle}>Auswahlrunde zurücknehmen?</h2>
          <p className={lead}>
            Die Sichtsperre gilt dann wieder. Wer in der Zwischenzeit Feedback gesehen hat, hat es gesehen. Einzeln
            aufgehobene Sperren bleiben aufgehoben.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button disabled={pending} className={button}>
              {pending ? "Nehme zurück …" : "Auswahlrunde zurücknehmen"}
            </button>
            <button type="button" onClick={() => dialog.current?.close()} className={secondaryButton}>
              Abbrechen
            </button>
          </div>
          {state.error && <p className={fieldError}>{state.error}</p>}
        </form>
      </dialog>
    </>
  );
}
