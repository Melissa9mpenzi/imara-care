import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, requiresMfa } from "@/lib/auth";
import StaffInvitationForm from "./staff-invitation-form";

export default async function StaffInvitationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.staffRole !== "facility_admin") {
    redirect("/");
  }
  if (
    requiresMfa(session.user.staffRole ?? session.user.role) &&
    session.user.twoFactorEnabled !== true
  ) {
    redirect("/security/two-factor?setup=required");
  }

  return <StaffInvitationForm />;
}
