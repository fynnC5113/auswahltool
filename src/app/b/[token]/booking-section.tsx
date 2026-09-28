"use client";

// "Dein Gesprächstermin" on the applicant page (Phase 12): variant A of the
// preview (Fynn, 29.09.2026), every day with its times as tiles; the chosen
// time is confirmed in a bar fixed to the bottom.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BookResult, Offer } from "@/lib/booking";
import { button, secondaryButton } from "../../ui";

type Props = {
  booked: Offer | null;
  /** Formatted rebooking deadline of the booked slot. */
  rebookUntil: string | null;
  canRebook: boolean;
  offers: Offer[];
  planned: boolean;
  interviewMinutes: number;
  rebookHoursBefore: number;
  replyTo: string;
  book: (slotId: string) => Promise<BookResult>;
};

const TZ = "Europe/Berlin";
const dayFormat = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const longFormat = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

const muted = "text-sm leading-relaxed text-zinc-600 dark:text-zinc-400";

function describe(offer: Offer): string {
  const start = new Date(offer.startsAt);
  return `${longFormat.format(start)}, ${timeFormat.format(start)}–${timeFormat.format(new Date(offer.interviewEndsAt))} Uhr · ${offer.location}`;
}

function byDay(offers: Offer[]): [string, Offer[]][] {
  const days = new Map<string, Offer[]>();
  for (const offer of offers) {
    const day = dayFormat.format(new Date(offer.startsAt));
    days.set(day, [...(days.get(day) ?? []), offer]);
  }
  return [...days];
}

export function BookingSection(props: Props) {
  const { booked, offers, replyTo } = props;
  const router = useRouter();
  const [rebooking, setRebooking] = useState(false);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const mail = <span className="font-medium break-all select-all">{replyTo}</span>;

  function onBook() {
    if (!selected) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await props.book(selected.id);
        if (result.status === "booked") {
          setSelected(null);
          setRebooking(false);
          if (result.mailFailed) {
            setNotice("Dein Termin ist gebucht. Die Bestätigungsmail konnte gerade nicht verschickt werden; der Termin steht hier auf der Seite.");
          }
        } else if (result.status === "taken") {
          setSelected(null);
          setError("Dieser Termin ist gerade vergeben worden. Bitte wähle einen anderen.");
        } else if (result.status === "error") {
          setError(result.message);
        } else {
          setError("Dieser Link ist ungültig.");
        }
        router.refresh();
      } catch (e) {
        console.error(e);
        setError(`Die Buchung hat nicht geklappt. Bitte versuche es noch einmal oder schreib an ${replyTo}.`);
      }
    });
  }

  const heading = (title: string, text?: string) => (
    <div className="mb-6 flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className={muted}>{text}</p>}
    </div>
  );
  const messages = (
    <>
      {error && <p className="mb-4 text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="mb-4 text-sm text-amber-800 dark:text-amber-300" role="status">{notice}</p>}
    </>
  );

  // Booked, not changing.
  if (booked && !rebooking) {
    return (
      <section>
        {heading("Dein Gesprächstermin")}
        {messages}
        <div className="mb-4 flex flex-col gap-1 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <span className="text-sm">Gebucht:</span>
          <span className="text-lg font-semibold tabular-nums">{describe(booked)}</span>
          <span className="text-sm">Die Einladung für deinen Kalender haben wir dir per Mail geschickt.</span>
        </div>
        {props.canRebook ? (
          <div className="flex flex-col items-start gap-3">
            <p className={muted}>Umbuchen kannst du bis {props.rebookUntil}.</p>
            {offers.length > 0 && (
              <button className={secondaryButton} onClick={() => { setError(""); setNotice(""); setRebooking(true); }}>
                Termin ändern
              </button>
            )}
          </div>
        ) : (
          <p className={muted}>
            Umbuchen ist nicht mehr möglich. Wenn du nicht kannst, schreib bitte an {mail}.
          </p>
        )}
      </section>
    );
  }

  // Nothing to choose from.
  if (!offers.length) {
    return (
      <section>
        {heading("Dein Gesprächstermin")}
        {messages}
        <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {props.planned ? (
            <>Gerade ist kein Termin frei, der passt. Schreib bitte an {mail}, dann finden wir einen Termin für dich.</>
          ) : (
            <>Die Gesprächstermine werden gerade geplant. Wir schreiben dir, sobald du hier buchen kannst.</>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className={selected ? "pb-32" : undefined}>
      {rebooking
        ? heading("Neuen Termin wählen", "Dein bisheriger Termin bleibt, bis du einen neuen buchst.")
        : heading(
            "Dein Gesprächstermin",
            `Wähle einen freien Termin. Das Gespräch dauert ${props.interviewMinutes} Minuten. Umbuchen kannst du bis ${props.rebookHoursBefore} Stunden vorher.`,
          )}
      {rebooking && (
        <div className="-mt-2 mb-6">
          <button className={secondaryButton} onClick={() => { setRebooking(false); setSelected(null); setError(""); }}>
            Abbrechen
          </button>
        </div>
      )}
      {messages}
      <div className="flex flex-col gap-6">
        {byDay(offers).map(([day, list]) => (
          <div key={day}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">{day}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {list.map((offer) => {
                const active = selected?.id === offer.id;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(offer)}
                    className={`rounded-md border px-1 py-2.5 text-center tabular-nums ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
                    }`}
                  >
                    {timeFormat.format(new Date(offer.startsAt))}
                    <span className={`block text-xs ${active ? "opacity-80" : "text-zinc-600 dark:text-zinc-400"}`}>{offer.location}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <p className="text-sm">{describe(selected)}</p>
            <button className={`${button} w-full`} onClick={onBook} disabled={pending}>
              {pending ? "Wird gebucht …" : rebooking ? "Auf diesen Termin umbuchen" : "Termin buchen"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
