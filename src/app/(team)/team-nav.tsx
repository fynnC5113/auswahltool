"use client";

// Team navigation. Below lg: tab bar at the bottom with the most used pages
// and "Mehr" for the rest (Fynn, 28.09.2026). From lg: one row at the top.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/auth/member";
import { BrandMark } from "../brand";
import { smallButton } from "../ui";
import { signOut } from "./actions";

type Icon = "home" | "calendar" | "list";
type Item = { href: string; label: string; adminOnly?: boolean; tab?: Icon };

// Order = order in the top row and in "Mehr". tab: shown in the bottom bar.
const ITEMS: Item[] = [
  { href: "/", label: "Übersicht", tab: "home" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit", tab: "calendar" },
  { href: "/bewerbungen", label: "Bewerbungen", tab: "list" },
  { href: "/terminplanung", label: "Terminplanung", adminOnly: true },
  { href: "/einstellungen/erfassen", label: "Erfassen", adminOnly: true },
  { href: "/einstellungen/runde", label: "Runde", adminOnly: true },
  { href: "/einstellungen/team", label: "Team", adminOnly: true },
];

const ICONS: Record<Icon | "more", ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
};

function Svg({ name }: { name: Icon | "more" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6"
    >
      {ICONS[name]}
    </svg>
  );
}

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

function SignOut() {
  return (
    <form action={signOut}>
      <button className={smallButton}>Abmelden</button>
    </form>
  );
}

export function TeamNav({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = ITEMS.filter((item) => !item.adminOnly || role === "admin");
  const tabs = items.filter((item) => item.tab);
  const rest = items.filter((item) => !item.tab);
  const restActive = rest.some((item) => isActive(pathname, item.href));

  return (
    <>
      {/* Top: mark everywhere, full menu row from lg. */}
      <header className="lg:sticky lg:top-0 lg:z-30 lg:border-b lg:border-line lg:bg-bar lg:backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-x-6 px-4 pt-4 lg:px-6 lg:py-2.5">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-note font-semibold">
            <BrandMark className="h-[18px] w-auto" />
            Orga-Team
          </Link>
          <nav className="hidden gap-x-1 lg:flex" aria-label="Hauptmenü">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className="rounded-field px-2.5 py-1.5 text-note text-muted hover:text-fg aria-[current=page]:bg-field aria-[current=page]:font-medium aria-[current=page]:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 text-note text-muted lg:flex">
            <span>{name}</span>
            <SignOut />
          </div>
        </div>
      </header>

      {/* Bottom: tab bar below lg. */}
      {moreOpen && (
        <button
          type="button"
          aria-label="Menü schließen"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.35)] lg:hidden"
        />
      )}
      {moreOpen && (
        <div
          id="more-menu"
          className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 rounded-group bg-surface py-1 shadow-[0_12px_40px_rgba(0,0,0,0.25)] lg:hidden"
        >
          <nav aria-label="Weitere Seiten" className="list flex flex-col">
            {rest.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className="px-4 py-3 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-note">
            <span className="flex-1 text-muted">{name}</span>
            <SignOut />
          </div>
        </div>
      )}
      <nav
        aria-label="Hauptmenü"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMoreOpen(false)}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="flex h-16 flex-col items-center justify-center gap-0.5 text-tab text-muted aria-[current=page]:font-semibold aria-[current=page]:text-accent"
          >
            <Svg name={item.tab!} />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-controls="more-menu"
          className={`flex h-16 flex-col items-center justify-center gap-0.5 text-tab ${
            restActive || moreOpen ? "font-semibold text-accent" : "text-muted"
          }`}
        >
          <Svg name="more" />
          Mehr
        </button>
      </nav>
    </>
  );
}
