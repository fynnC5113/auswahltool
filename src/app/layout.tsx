import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auswahltool",
  description: "Auswahlrunde des Orga-Teams der Law Clinic",
};

// Browser bars follow the page background (DESIGN.md: bg).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
