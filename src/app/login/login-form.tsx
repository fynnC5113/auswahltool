"use client";

import { useActionState } from "react";
import { button, input } from "../ui";
import { requestLogin } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestLogin, { message: "" });

  if (state.message) return <p aria-live="polite">{state.message}</p>;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email">Mailadresse</label>
      <input id="email" name="email" type="email" autoComplete="email" required className={input} />
      <button disabled={pending} className={button}>
        {pending ? "Wird gesendet …" : "Login-Link anfordern"}
      </button>
    </form>
  );
}
