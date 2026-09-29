// Law Clinic mark (logo without the black lettering, which would vanish in
// dark mode) with "Law Clinic / Orga-Team". Head of the public pages.
import Image from "next/image";
import type { ReactNode } from "react";
import { lead, title } from "./ui";

export function BrandMark({ className = "h-[22px] w-auto" }: { className?: string }) {
  return <Image src="/law-clinic-mark.png" alt="" width={271} height={176} unoptimized priority className={className} />;
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="text-small">
        <b className="block font-semibold">Law Clinic</b>
        <span className="block text-muted">Orga-Team</span>
      </div>
    </div>
  );
}

// Title of a page with an optional lead below.
export function PageHeader({ heading, children }: { heading: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className={title}>{heading}</h1>
      {children && <div className={lead}>{children}</div>}
    </div>
  );
}
