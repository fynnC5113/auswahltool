import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { Brand, PageHeader } from "../brand";
import { page } from "../ui";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { member } = await getMember(await createClient());
  if (member) redirect("/");

  return (
    <main className={`${page} sm:max-w-[440px]`}>
      <Brand />
      <PageHeader heading="Auswahltool Login" />
      <LoginForm />
    </main>
  );
}
