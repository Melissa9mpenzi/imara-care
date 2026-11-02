import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { hash, verify } from "@node-rs/argon2";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, jwt, twoFactor } from "better-auth/plugins";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const authDatabase = new Database(
  join(process.cwd(), "imara-care-auth.db"),
);
authDatabase.pragma("journal_mode = WAL");
authDatabase.exec(`
  CREATE TABLE IF NOT EXISTS staff_invitations (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    staff_role TEXT NOT NULL,
    facility_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_staff_invitations_email
    ON staff_invitations (facility_id, email, expires_at);
  CREATE TABLE IF NOT EXISTS auth_audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    facility_id TEXT,
    action TEXT NOT NULL,
    email_hash TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_login_limits (
    email_hash TEXT PRIMARY KEY,
    failure_count INTEGER NOT NULL,
    window_started_at TEXT NOT NULL,
    locked_until TEXT
  );
  CREATE TABLE IF NOT EXISTS auth_mfa_setup_pending (
    user_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL
  );
`);

export const invitationTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function findActiveInvitation(token: string) {
  return authDatabase
    .prepare(
      `SELECT id, email, full_name AS fullName, staff_role AS staffRole,
              facility_id AS facilityId, expires_at AS expiresAt
       FROM staff_invitations
       WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL
         AND expires_at > ?`,
    )
    .get(invitationTokenHash(token), new Date().toISOString()) as
    | {
        id: string;
        email: string;
        fullName: string;
        staffRole: string;
        facilityId: string;
        expiresAt: string;
      }
    | undefined;
}

export function recordAuthAudit(
  action: string,
  options: { actorUserId?: string; facilityId?: string; email?: string } = {},
) {
  authDatabase
    .prepare(
      `INSERT INTO auth_audit_events
        (id, actor_user_id, facility_id, action, email_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      options.actorUserId ?? null,
      options.facilityId ?? null,
      action,
      options.email
        ? createHash("sha256").update(options.email.trim().toLowerCase()).digest("hex")
        : null,
      new Date().toISOString(),
    );
}

const facilityId = process.env.IMARA_FACILITY_ID ?? "IM";
const loginWindowMilliseconds = 15 * 60 * 1000;
const mfaRequiredRoles = new Set([
  "admin",
  "facility_admin",
  "medical_director",
  "clinician",
  "pharmacist",
]);

export function requiresMfa(role: unknown) {
  return typeof role === "string" && mfaRequiredRoles.has(role);
}

function normalizedEmail(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function emailHash(email: string) {
    return createHash("sha256").update(email).digest("hex");
}

function recordFailedLogin(email: string) {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const hashedEmail = emailHash(email);
    const previous = authDatabase
      .prepare(
        `SELECT failure_count AS failureCount, window_started_at AS windowStartedAt
         FROM auth_login_limits WHERE email_hash = ?`,
      )
      .get(hashedEmail) as
      | { failureCount: number; windowStartedAt: string }
      | undefined;
    const inWindow =
      previous !== undefined && now - Date.parse(previous.windowStartedAt) < loginWindowMilliseconds;
    const failureCount = inWindow ? previous.failureCount + 1 : 1;
    const windowStartedAt = inWindow ? previous.windowStartedAt : nowIso;
    const lockedUntil =
      failureCount >= 5
        ? new Date(now + loginWindowMilliseconds).toISOString()
        : null;

    authDatabase
      .prepare(
        `INSERT INTO auth_login_limits
          (email_hash, failure_count, window_started_at, locked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email_hash) DO UPDATE SET
           failure_count = excluded.failure_count,
           window_started_at = excluded.window_started_at,
           locked_until = excluded.locked_until`,
      )
      .run(hashedEmail, failureCount, windowStartedAt, lockedUntil);
}

async function passwordHasBeenBreached(password: string): Promise<boolean> {
    const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    let response: Response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
    } catch {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Password safety checks are temporarily unavailable. Try again shortly.",
      });
    }
    if (!response.ok) {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Password safety checks are temporarily unavailable. Try again shortly.",
      });
    }
    let ranges: string;
    try {
      ranges = await response.text();
    } catch {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Password safety checks are temporarily unavailable. Try again shortly.",
      });
    }
    return ranges
      .split(/\r?\n/)
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
}

export const auth = betterAuth({
  appName: "IMARA-CARE",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  database: authDatabase,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    password: {
      hash: (password) =>
        hash(password, {
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
      verify: ({ hash: encodedHash, password }) => verify(encodedHash, password),
    },
  },
  user: {
    additionalFields: {
      facilityId: { type: "string", required: false, input: false },
      staffRole: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          if (context?.path !== "/sign-up/email") return;
          const token = context.request?.headers.get("x-imara-invite-token");
          const invitation = token ? findActiveInvitation(token) : undefined;
          if (!invitation || normalizedEmail(user.email) !== invitation.email) return false;
          return {
            data: {
              ...user,
              emailVerified: true,
              facilityId: invitation.facilityId,
              staffRole: invitation.staffRole,
            },
          };
        },
      },
    },
  },
  session: {
    expiresIn: 15 * 60,
    updateAge: 60,
    cookieCache: { enabled: false },
  },
  plugins: [
    admin(),
    twoFactor({
      issuer: "IMARA-CARE",
      totpOptions: { digits: 6, period: 30 },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 5,
        durationSeconds: 15 * 60,
      },
    }),
    jwt({
      jwt: {
        definePayload: ({ user }) => ({
          sub: user.id,
          facilityId: user.facilityId ?? facilityId,
          staffRole: user.staffRole ?? user.role ?? "staff",
          mfa: user.twoFactorEnabled === true,
        }),
      },
    }),
  ],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/sign-up/email": { window: 15 * 60, max: 10 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/two-factor/disable") {
        const session = ctx.headers
          ? await auth.api.getSession({ headers: ctx.headers })
          : null;
        if (session && requiresMfa(session.user.staffRole ?? session.user.role)) {
          throw new APIError("FORBIDDEN", {
            message: "Authenticator MFA is required for this staff role.",
          });
        }
      }

      if (ctx.path === "/sign-in/email") {
        const email = normalizedEmail(ctx.body?.email);
        if (!email) return;
        const limit = authDatabase
          .prepare(
            "SELECT locked_until AS lockedUntil FROM auth_login_limits WHERE email_hash = ?",
          )
          .get(emailHash(email)) as { lockedUntil: string | null } | undefined;
        if (limit?.lockedUntil && Date.parse(limit.lockedUntil) > Date.now()) {
          recordAuthAudit("login.locked", { facilityId, email });
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many sign-in attempts. Try again in 15 minutes.",
          });
        }
        return;
      }

      if (ctx.path !== "/sign-up/email") return;

      const token = ctx.headers?.get("x-imara-invite-token");
      const invitation = token ? findActiveInvitation(token) : undefined;
      if (!invitation) {
        throw new APIError("FORBIDDEN", {
          message: "An active staff invitation is required to create an account.",
        });
      }

      if (ctx.body.email.trim().toLowerCase() !== invitation.email) {
        throw new APIError("FORBIDDEN", {
          message: "Use the email address that received this invitation.",
        });
      }

      if (await passwordHasBeenBreached(ctx.body.password)) {
        throw new APIError("BAD_REQUEST", {
          message: "Choose a password that has not appeared in known data breaches.",
        });
      }

      return {
        context: {
          ...ctx,
          body: {
            ...ctx.body,
            name: invitation.fullName,
          },
        },
      };
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.context.newSession) {
        const token = ctx.headers?.get("x-imara-invite-token");
        const invitation = token ? findActiveInvitation(token) : undefined;
        if (!invitation) return;

        authDatabase
          .prepare(
            `UPDATE staff_invitations
             SET used_at = ?
             WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
          )
          .run(new Date().toISOString(), invitation.id);
        recordAuthAudit("invite.accepted", {
          actorUserId: ctx.context.newSession.user.id,
          facilityId: invitation.facilityId,
          email: invitation.email,
        });
      }

      if (ctx.path === "/sign-in/email") {
        const session = ctx.context.newSession;
        const email = normalizedEmail(ctx.body?.email);
        const response = ctx.context.returned;
        const twoFactorChallenge =
          typeof response === "object" &&
          response !== null &&
          "twoFactorRedirect" in response &&
          response.twoFactorRedirect === true;
        if (email && session) {
          authDatabase
            .prepare("DELETE FROM auth_login_limits WHERE email_hash = ?")
            .run(emailHash(email));
        } else if (email && !twoFactorChallenge) {
          recordFailedLogin(email);
        }
        recordAuthAudit(
          twoFactorChallenge
            ? "mfa.challenge"
            : session
              ? "login.success"
              : "login.failed",
          {
          actorUserId: session?.user.id,
          facilityId: session?.user.facilityId,
          email: ctx.body?.email,
          },
        );
      }

      if (
        ctx.path === "/two-factor/verify-totp" ||
        ctx.path === "/two-factor/verify-backup-code"
      ) {
        const response = ctx.context.returned;
        if (
          typeof response === "object" &&
          response !== null &&
          "user" in response &&
          typeof response.user === "object" &&
          response.user !== null &&
          "id" in response.user &&
          typeof response.user.id === "string"
        ) {
          const userId = response.user.id;
          const pendingSetup =
            ctx.path === "/two-factor/verify-totp" &&
            authDatabase
              .prepare("SELECT user_id FROM auth_mfa_setup_pending WHERE user_id = ?")
              .get(userId);
          if (pendingSetup) {
            authDatabase
              .prepare("DELETE FROM auth_mfa_setup_pending WHERE user_id = ?")
              .run(userId);
            recordAuthAudit("mfa.enabled", { actorUserId: userId, facilityId });
          } else {
            recordAuthAudit("login.success", { actorUserId: userId, facilityId });
          }
        }
      }

      if (ctx.path === "/two-factor/enable" && ctx.context.session) {
        authDatabase
          .prepare(
            `INSERT INTO auth_mfa_setup_pending (user_id, started_at)
             VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET started_at = excluded.started_at`,
          )
          .run(ctx.context.session.user.id, new Date().toISOString());
      }
    }),
  },
});

export { authDatabase };
