import { NextResponse } from "next/server";
import {
  getLocalPasswordResetCode,
  getLocalTwoFactorCode,
} from "@/lib/auth";
import { queryAuthDatabase } from "@/lib/auth-database";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    process.env.NODE_ENV !== "development" ||
    !loopbackHosts.has(url.hostname) ||
    (origin !== null && origin !== url.origin) ||
    (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none")
  ) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  let email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const purpose = url.searchParams.get("purpose") ?? "password-reset";
  if (!email && purpose === "two-factor") {
    const username = url.searchParams.get("username")?.trim().toLowerCase() ?? "";
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      return NextResponse.json({ detail: "Not found." }, { status: 404 });
    }
    const result = await queryAuthDatabase<{ email: string }>(
      'SELECT email FROM "user" WHERE "username" = ?',
      [username],
    );
    email = result.rows[0]?.email.trim().toLowerCase() ?? "";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }
  if (purpose !== "password-reset" && purpose !== "two-factor") {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }

  const code =
    purpose === "two-factor"
      ? await getLocalTwoFactorCode(email)
      : await getLocalPasswordResetCode(email);
  if (!code) {
    return NextResponse.json(
      { detail: "No local reset code is available." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { code },
    { headers: { "Cache-Control": "no-store" } },
  );
}
