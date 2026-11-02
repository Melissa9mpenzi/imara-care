import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const defaults = new Map([
  ["NEXT_PUBLIC_API_URL", "http://localhost:8000/api/v1"],
  ["BETTER_AUTH_URL", "http://localhost:3000"],
  ["BETTER_AUTH_SECRET", randomBytes(32).toString("base64url")],
  ["IMARA_FACILITY_ID", "IM"],
  ["IMARA_FACILITY_NAME", "Imara Care Clinic"],
]);
const additions = [...defaults]
  .filter(([key]) => !new RegExp(`^${key}=`, "m").test(existing))
  .map(([key, value]) => `${key}=${value}`);

if (additions.length > 0) {
  const content = `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${additions.join("\n")}\n`;
  if (existsSync(envPath)) appendFileSync(envPath, `\n${additions.join("\n")}\n`, "utf8");
  else writeFileSync(envPath, content, { encoding: "utf8", mode: 0o600 });
}

console.log("Local auth configuration is ready in .env.local. Keep that file private.");
