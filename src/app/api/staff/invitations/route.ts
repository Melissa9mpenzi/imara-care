import { randomBytes, randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth, authDatabase, invitationTokenHash, recordAuthAudit } from "@/lib/auth";

export const runtime = "nodejs";

const staffRoles = new Set([
  "facility_admin",
  "medical_director",
  "clinician",
  "pharmacist",
  "reception",
  "laboratory",
  "pharmacy",
  "cashier",
]);

function getMailer() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
    }),
  };
}

function hasTrustedOrigin(request: Request) {
  const expectedOrigin = new URL(
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).origin;
  return request.headers.get("origin") === expectedOrigin;
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ detail: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ detail: "Sign in is required." }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.staffRole !== "facility_admin") {
    return NextResponse.json({ detail: "Administrator access is required." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "Provide invitation details." }, { status: 422 });
  }
  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const staffRole = typeof input.staffRole === "string" ? input.staffRole : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ detail: "Enter a valid staff email address." }, { status: 422 });
  }
  if (!fullName || fullName.length > 160 || !staffRoles.has(staffRole)) {
    return NextResponse.json({ detail: "Provide a name and a valid staff role." }, { status: 422 });
  }

  const facilityId = process.env.IMARA_FACILITY_ID ?? "IM";
  const facilityName = process.env.IMARA_FACILITY_NAME ?? "Imara Care Clinic";
  const mailer = getMailer();
  if (!mailer && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { detail: "Invitation email is not configured. Configure SMTP before inviting staff." },
      { status: 503 },
    );
  }

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const invitationUrl = new URL(
    `/invite/${encodeURIComponent(rawToken)}`,
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).toString();

  authDatabase
    .prepare(
      `UPDATE staff_invitations
       SET revoked_at = ?
       WHERE email = ? AND facility_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    )
    .run(createdAt, email, facilityId);
  authDatabase
    .prepare(
      `INSERT INTO staff_invitations
        (id, token_hash, email, full_name, staff_role, facility_id, created_by,
         created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      invitationTokenHash(rawToken),
      email,
      fullName,
      staffRole,
      facilityId,
      session.user.id,
      createdAt,
      expiresAt,
    );

  if (mailer) {
    try {
      await mailer.transport.sendMail({
        from: mailer.from,
        to: email,
        subject: `${facilityName} invited you to IMARA-CARE`,
        text: `${fullName},\n\nYou have been invited to join ${facilityName} as ${staffRole.replaceAll("_", " ")}.\n\nAccept the invitation within 48 hours:\n${invitationUrl}\n`,
      });
    } catch (error) {
      authDatabase
        .prepare("UPDATE staff_invitations SET revoked_at = ? WHERE id = ?")
        .run(new Date().toISOString(), id);
      console.error("Could not send staff invitation email.", error);
      return NextResponse.json(
        { detail: "The invitation email could not be sent. Check the email settings and try again." },
        { status: 502 },
      );
    }
  }

  recordAuthAudit("invite.sent", {
    actorUserId: session.user.id,
    facilityId,
    email,
  });

  return NextResponse.json({
    id,
    email,
    expiresAt,
    ...(process.env.NODE_ENV === "production" ? {} : { invitationUrl }),
  });
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ detail: "Request origin is not allowed." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ detail: "Sign in is required." }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.staffRole !== "facility_admin") {
    return NextResponse.json({ detail: "Administrator access is required." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const id =
    body && typeof body === "object" && "id" in body && typeof body.id === "string"
      ? body.id
      : "";
  if (!id) {
    return NextResponse.json({ detail: "Provide the invitation ID." }, { status: 422 });
  }

  const result = authDatabase
    .prepare(
      `UPDATE staff_invitations SET revoked_at = ?
       WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    )
    .run(new Date().toISOString(), id);
  if (result.changes === 0) {
    return NextResponse.json({ detail: "Invitation not found or already used." }, { status: 404 });
  }

  recordAuthAudit("invite.revoked", {
    actorUserId: session.user.id,
    facilityId: process.env.IMARA_FACILITY_ID ?? "IM",
  });
  return NextResponse.json({ revoked: true });
}
