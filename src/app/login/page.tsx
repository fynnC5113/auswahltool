import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { page } from "../ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { member } = await getMember(await createClient());
  if (member) redirect("/");

  return (
    <main className={`${page} max-w-sm`}>
      <h1 className="mb-6 text-2xl font-semibold">Auswahltool Login</h1>
      <LoginForm />
    </main>
  );
}
