"use client";

// Team navigation. Below lg: tab bar at the bottom with the most used pages
// and "Mehr" for the rest (Fynn, 28.09.2026). From lg: one row at the top.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/auth/member";
import { secondaryButton } from "../ui";
import { signOut } from "./actions";

type Icon = "home" | "calendar" | "list";
type Item = { href: string; label: string; adminOnly?: boolean; tab?: Icon };

// Order = order in the top row and in "Mehr". tab: shown in the bottom bar.
const ITEMS: Item[] = [
  { href: "/", label: "Übersicht", tab: "home" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit", tab: "calendar" },
  { href: "/bewerbungen", label: "Bewerbungen", adminOnly: true, tab: "list" },
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
      className="h-6 w-6"
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
      <button className={secondaryButton}>Abmelden</button>
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
      {/* Top: brand everywhere, full row from lg. */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-x-6 px-4 py-3">
          <Link href="/" className="font-semibold">
            Auswahltool
          </Link>
          <nav className="hidden gap-x-4 text-sm lg:flex" aria-label="Hauptmenü">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className="aria-[current=page]:font-semibold aria-[current=page]:underline aria-[current=page]:underline-offset-4"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 text-sm lg:flex">
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
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}
      {moreOpen && (
        <div
          id="more-menu"
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 rounded-t-xl border-t border-zinc-200 bg-white px-4 pb-3 pt-2 shadow-lg lg:hidden dark:border-zinc-800 dark:bg-zinc-950"
        >
          <nav aria-label="Weitere Seiten" className="flex flex-col">
            {rest.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className="rounded px-2 py-3 text-base aria-[current=page]:font-semibold"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-2 flex items-center gap-3 border-t border-zinc-200 px-2 pt-3 text-sm dark:border-zinc-800">
            <span className="flex-1 text-zinc-600 dark:text-zinc-400">{name}</span>
            <SignOut />
          </div>
        </div>
      )}
      <nav
        aria-label="Hauptmenü"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-zinc-800 dark:bg-zinc-950"
        style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMoreOpen(false)}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className="flex h-16 flex-col items-center justify-center gap-0.5 text-xs text-zinc-500 aria-[current=page]:font-semibold aria-[current=page]:text-zinc-900 dark:text-zinc-400 dark:aria-[current=page]:text-zinc-100"
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
          className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${
            restActive || moreOpen ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          <Svg name="more" />
          Mehr
        </button>
      </nav>
    </>
  );
}
