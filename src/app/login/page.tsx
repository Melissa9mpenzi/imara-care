import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const session = await getAuthSession(await headers());
  if (session) redirect("/");

  const googleEnabled = Boolean(
    (process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_CLIENT_ID)?.trim() &&
      (process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_CLIENT_SECRET)?.trim(),
  );
  return <LoginForm googleEnabled={googleEnabled} />;
}
