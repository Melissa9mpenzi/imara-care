import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSession, requiresMfa } from "@/lib/auth";
import { queryAuthDatabase } from "@/lib/auth-database";

export type FacilityStaffMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  staffRole: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  banned: boolean;
  createdAt: string;
};

export function canManageStaff(user: {
  role?: string | null;
  staffRole?: string | null;
}) {
  return user.role === "admin" || user.staffRole === "facility_admin";
}

export async function requireStaffManager() {
  const session = await getAuthSession(await headers());
  if (!session) redirect("/login");

  if (!canManageStaff(session.user)) redirect("/");

  if (
    requiresMfa(session.user.staffRole ?? session.user.role) &&
    session.user.twoFactorEnabled !== true
  ) {
    redirect("/security/two-factor?setup=required");
  }

  return session.user.facilityId ?? process.env.IMARA_FACILITY_ID ?? "IM";
}

export async function getFacilityStaff(facilityId: string) {
  const result = await queryAuthDatabase<FacilityStaffMember>(
    `SELECT u.id, u.name, u.email, u.image, u.role,
            u."staffRole" AS "staffRole",
            u."departmentCode" AS "departmentCode",
            CASE
              WHEN u."departmentCode" = 'BILL' THEN 'Billing & insurance'
              ELSE d.name
            END AS "departmentName",
            u."emailVerified" AS "emailVerified",
            u."twoFactorEnabled" AS "twoFactorEnabled",
            u.banned,
            u."createdAt"::text AS "createdAt"
       FROM "user" AS u
       LEFT JOIN public.departments AS d
         ON d.code = u."departmentCode"
        AND d.facility_id = u."facilityId"
      WHERE u."facilityId" = ?
      ORDER BY LOWER(u.name), LOWER(u.email)`,
    [facilityId],
  );
  return result.rows;
}
