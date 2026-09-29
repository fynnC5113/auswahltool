"use client";

// "Dein Gesprächstermin" on the applicant page (Phase 12): variant A of the
// preview (Fynn, 29.09.2026), every day with its times as tiles; the chosen
// time is confirmed in a bar fixed to the bottom.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BookResult, Offer } from "@/lib/booking";
import { alertBox, bottomBar, button, lead, noticeBox, okText, secondaryButton, section, sectionTitle } from "../../ui";

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
    <>
      <h2 className={sectionTitle}>{title}</h2>
      {text && <p className={lead}>{text}</p>}
    </>
  );
  const messages = (
    <>
      {error && <p className={alertBox} role="alert">{error}</p>}
      {notice && <p className={noticeBox} role="status">{notice}</p>}
    </>
  );

  // Booked, not changing.
  if (booked && !rebooking) {
    return (
      <section className={section}>
        {heading("Dein Gesprächstermin")}
        {messages}
        <div className="flex flex-col gap-1.5 rounded-group bg-surface p-4">
          <span className={`flex items-center gap-2 ${okText}`}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Gebucht
          </span>
          <span className="text-section font-semibold tabular-nums">{describe(booked)}</span>
          <span className={lead}>Die Einladung für deinen Kalender haben wir dir per Mail geschickt.</span>
        </div>
        {props.canRebook ? (
          <div className="flex flex-col gap-3 pt-1">
            <p className={lead}>Umbuchen kannst du bis {props.rebookUntil}.</p>
            {offers.length > 0 && (
              <button className={secondaryButton} onClick={() => { setError(""); setNotice(""); setRebooking(true); }}>
                Termin ändern
              </button>
            )}
          </div>
        ) : (
          <p className={lead}>
            Umbuchen ist nicht mehr möglich. Wenn du nicht kannst, schreib bitte an {mail}.
          </p>
        )}
      </section>
    );
  }

  // Nothing to choose from.
  if (!offers.length) {
    return (
      <section className={section}>
        {heading("Dein Gesprächstermin")}
        {messages}
        <p className={noticeBox}>
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
    <section className={`${section} ${selected ? "pb-36" : ""}`}>
      {rebooking
        ? heading("Neuen Termin wählen", "Dein bisheriger Termin bleibt, bis du einen neuen buchst.")
        : heading(
            "Dein Gesprächstermin",
            `Wähle einen freien Termin. Das Gespräch dauert ${props.interviewMinutes} Minuten. Umbuchen kannst du bis ${props.rebookHoursBefore} Stunden vorher.`,
          )}
      {rebooking && (
        <div className="pt-1">
          <button className={secondaryButton} onClick={() => { setRebooking(false); setSelected(null); setError(""); }}>
            Abbrechen
          </button>
        </div>
      )}
      {messages}
      <div className="flex flex-col gap-4 rounded-group bg-surface p-4">
        {byDay(offers).map(([day, list]) => (
          <div key={day}>
            <h3 className="mb-2 text-note font-semibold">{day}</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {list.map((offer) => {
                const active = selected?.id === offer.id;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(offer)}
                    className={`min-h-11 rounded-field px-1 py-2 text-center font-medium tabular-nums ${
                      active ? "bg-accent text-on-accent" : "shadow-[inset_0_0_0_1px_var(--c-line)] hover:bg-field"
                    }`}
                  >
                    {timeFormat.format(new Date(offer.startsAt))}
                    <span className={`block text-small font-normal ${active ? "opacity-80" : "text-muted"}`}>{offer.location}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className={`fixed inset-x-0 bottom-0 z-10 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${bottomBar}`}>
          <div className="mx-auto flex max-w-[680px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-2">
            <p className="text-center text-note font-medium sm:text-left">{describe(selected)}</p>
            <button className={button} onClick={onBook} disabled={pending}>
              {pending ? "Wird gebucht …" : rebooking ? "Auf diesen Termin umbuchen" : "Termin buchen"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
