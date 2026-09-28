"use client";

import Link from "next/link";
import { useActionState } from "react";
import { button } from "../../ui";
import { confirmLogin } from "./actions";

export function ConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [state, formAction, pending] = useActionState(confirmLogin, { error: "" });

  if (state.error) {
    return (
      <p aria-live="polite">
        {state.error}{" "}
        <Link href="/login" className="underline">
          Zum Login
        </Link>
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <button disabled={pending} className={button}>
        {pending ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  );
}
