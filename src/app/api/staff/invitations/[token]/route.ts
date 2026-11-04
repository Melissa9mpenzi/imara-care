import { NextResponse } from "next/server";
import { findActiveInvitation } from "@/lib/auth";

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

  return NextResponse.json({
    email: invitation.email,
    fullName: invitation.fullName,
    staffRole: invitation.staffRole,
    facilityName: process.env.IMARA_FACILITY_NAME ?? "Imara Care Clinic",
    expiresAt: invitation.expiresAt,
  });
}
