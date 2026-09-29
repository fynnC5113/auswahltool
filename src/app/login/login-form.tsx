"use client";

import { useActionState } from "react";
import { button, fieldLabel, formGroup, input } from "../ui";
import { requestLogin } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestLogin, { message: "" });

  if (state.message)
    return (
      <p className="rounded-group bg-surface p-4" aria-live="polite">
        {state.message}
      </p>
    );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className={formGroup}>
        <label htmlFor="email" className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Mailadresse</span>
          <input id="email" name="email" type="email" autoComplete="email" required className={input} />
        </label>
      </div>
      <button disabled={pending} className={`${button} sm:w-full`}>
        {pending ? "Wird gesendet …" : "Login-Link anfordern"}
      </button>
    </form>
  );
}
