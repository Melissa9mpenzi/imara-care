import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, requiresMfa } from "@/lib/auth";
import TwoFactorSetup from "./two-factor-setup";

export default async function TwoFactorSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const role = session.user.staffRole ?? session.user.role;
  return (
    <main className="auth-page">
      <TwoFactorSetup
        email={session.user.email}
        enabled={session.user.twoFactorEnabled === true}
        required={requiresMfa(role)}
      />
    </main>
  );
}
