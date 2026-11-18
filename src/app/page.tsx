import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard-client";
import { getAuthSession, requiresMfa } from "@/lib/auth";
import { canManageStaff, getFacilityStaff } from "@/lib/staff-directory";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    section?: string | string[];
    staffId?: string | string[];
  }>;
}) {
  const session = await getAuthSession(await headers());
  if (!session) redirect("/login");
  if (
    requiresMfa(session.user.staffRole ?? session.user.role) &&
    session.user.twoFactorEnabled !== true
  ) {
    redirect("/security/two-factor?setup=required");
  }

  const params = await searchParams;
  const section = Array.isArray(params.section)
    ? params.section[0]
    : params.section;
  const staffId = Array.isArray(params.staffId)
    ? params.staffId[0]
    : params.staffId;
  const managesStaff = canManageStaff(session.user);
  const staff = managesStaff
    ? await getFacilityStaff(
        session.user.facilityId ?? process.env.IMARA_FACILITY_ID ?? "IM",
      )
    : [];

  return (
    <DashboardClient
      initialSection={managesStaff && section === "staff" ? "staff" : "overview"}
      initialStaff={staff}
      initialStaffId={managesStaff && section === "staff" ? staffId ?? null : null}
    />
  );
}
