import { NextResponse } from "next/server";
import { findActiveInvitation } from "@/lib/auth";
import { queryAuthDatabase } from "@/lib/auth-database";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invitation = await findActiveInvitation(token);
  if (!invitation) {
    return NextResponse.json({ detail: "Invitation unavailable." }, { status: 404 });
  }

  const departmentName =
    invitation.departmentCode === "BILL"
      ? "Billing & insurance"
      : (
          await queryAuthDatabase<{ name: string }>(
            `SELECT d.name FROM public.departments d
               JOIN public.facilities f ON f.id = d.facility_id
              WHERE d.code = ? AND f.code = ? AND d.active = TRUE`,
            [invitation.departmentCode, invitation.facilityId],
          )
        ).rows[0]?.name ?? invitation.departmentCode ?? "Department not specified";

  return NextResponse.json({
    email: invitation.email,
    fullName: invitation.fullName,
    staffRole: invitation.staffRole,
    departmentName,
    facilityName: process.env.IMARA_FACILITY_NAME ?? "Imara Care Clinic",
    expiresAt: invitation.expiresAt,
  });
}
