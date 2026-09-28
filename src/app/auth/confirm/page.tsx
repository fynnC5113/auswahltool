// The login link lands here. Only the button signs in, so mail scanners that
// open links automatically do not use up the one-time link (TECH_DESIGN 3).
import Link from "next/link";
import { page } from "../../ui";
import { ConfirmForm } from "./confirm-form";

export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash } = await searchParams;

  return (
    <main className={`${page} max-w-sm`}>
      <h1 className="mb-6 text-2xl font-semibold">Auswahltool Login</h1>
      {typeof token_hash === "string" && token_hash ? (
        <ConfirmForm tokenHash={token_hash} />
      ) : (
        <p>
          Dieser Link ist unvollständig.{" "}
          <Link href="/login" className="underline">
            Zum Login
          </Link>
        </p>
      )}
    </main>
  );
}
