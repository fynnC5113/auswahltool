// The login link lands here. Only the button signs in, so mail scanners that
// open links automatically do not use up the one-time link (TECH_DESIGN 3).
import Link from "next/link";
import { Brand, PageHeader } from "../../brand";
import { link, page } from "../../ui";
import { ConfirmForm } from "./confirm-form";

export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash } = await searchParams;

  return (
    <main className={`${page} sm:max-w-[440px]`}>
      <Brand />
      <PageHeader heading="Auswahltool Login" />
      {typeof token_hash === "string" && token_hash ? (
        <ConfirmForm tokenHash={token_hash} />
      ) : (
        <p>
          Dieser Link ist unvollständig.{" "}
          <Link href="/login" className={link}>
            Zum Login
          </Link>
        </p>
      )}
    </main>
  );
}
