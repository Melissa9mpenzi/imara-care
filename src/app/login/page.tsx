import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const session = await getAuthSession(await headers());
  if (session) redirect("/");

  return <LoginForm />;
}
