import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { ensureAuthSupportTables } from "@/lib/auth-database";

export const runtime = "nodejs";
const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await ensureAuthSupportTables();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await ensureAuthSupportTables();
  return handlers.POST(request);
}
