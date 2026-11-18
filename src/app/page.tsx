import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard-client";
import { getAuthSession, requiresMfa } from "@/lib/auth";

export default async function Home() {
  const session = await getAuthSession(await headers());
  if (!session) redirect("/login");
  if (
    requiresMfa(session.user.staffRole ?? session.user.role) &&
    session.user.twoFactorEnabled !== true
  ) {
    redirect("/security/two-factor?setup=required");
  }

  return <DashboardClient />;
}
