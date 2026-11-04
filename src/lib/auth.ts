import { createHash, randomUUID } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import nodemailer from "nodemailer";
import { admin, emailOTP, jwt, twoFactor } from "better-auth/plugins";
import { authDatabase, queryAuthDatabase } from "@/lib/auth-database";

export const invitationTokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function findActiveInvitation(token: string) {
  const result = await queryAuthDatabase<{
    id: string;
    email: string;
    fullName: string;
    staffRole: string;
    facilityId: string;
    expiresAt: string;
  }>(
    `SELECT id, email, full_name AS "fullName", staff_role AS "staffRole",
              facility_id AS "facilityId", expires_at AS "expiresAt"
       FROM staff_invitations
       WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL
         AND expires_at > ?`,
    [invitationTokenHash(token), new Date().toISOString()],
  );
  return result.rows[0];
}

export async function recordAuthAudit(
  action: string,
  options: { actorUserId?: string; facilityId?: string; email?: string } = {},
) {
  await queryAuthDatabase(
    `INSERT INTO auth_audit_events
        (id, actor_user_id, facility_id, action, email_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      options.actorUserId ?? null,
      options.facilityId ?? null,
      action,
      options.email
        ? createHash("sha256").update(options.email.trim().toLowerCase()).digest("hex")
        : null,
      new Date().toISOString(),
    ],
  );
}

const facilityId = process.env.IMARA_FACILITY_ID ?? "IM";
const authBaseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const authBase = new URL(authBaseURL);
const trustedOrigins = new Set([authBase.origin]);
if (authBase.hostname === "localhost" || authBase.hostname === "127.0.0.1") {
  const alternateLoopback = new URL(authBase);
  alternateLoopback.hostname =
    authBase.hostname === "localhost" ? "127.0.0.1" : "localhost";
  trustedOrigins.add(alternateLoopback.origin);
}
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

function localPasswordResetMailboxEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.LOCAL_AUTH_MAILBOX === "true"
  );
}

function getAuthMailer() {
  const { SMTP_HOST, SMTP_FROM, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE } = process.env;
  if ((!SMTP_HOST || !SMTP_PASSWORD) && localPasswordResetMailboxEnabled()) {
    return null;
  }

  const port = Number(SMTP_PORT ?? "587");
  if (
    !SMTP_HOST ||
    !SMTP_FROM ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD))
  ) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Authentication email delivery is not configured.",
    });
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true",
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });
}

async function sendPasswordResetOTP(email: string, otp: string) {
  const transport = getAuthMailer();
  if (!transport) {
    await queryAuthDatabase(
      `INSERT INTO auth_local_mailbox (email_hash, code, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(email_hash) DO UPDATE SET
           code = excluded.code,
           expires_at = excluded.expires_at`,
      [
        emailHash(normalizedEmail(email)),
        otp,
        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      ],
    );
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your IMARA-CARE password reset code",
    text: `Your password reset code is ${otp}. It expires in 10 minutes. If you did not request a password reset, ignore this email.`,
    html: `<p>Your IMARA-CARE password reset code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. If you did not request a password reset, ignore this email.</p>`,
  });
}

async function sendTwoFactorOTP(email: string, otp: string) {
  const transport = getAuthMailer();
  if (!transport) {
    await queryAuthDatabase(
      `INSERT INTO auth_local_two_factor_mailbox (email_hash, code, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(email_hash) DO UPDATE SET
           code = excluded.code,
           expires_at = excluded.expires_at`,
      [
        emailHash(normalizedEmail(email)),
        otp,
        new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      ],
    );
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your IMARA-CARE sign-in code",
    text: `Your sign-in verification code is ${otp}. It expires in 10 minutes. If you did not try to sign in, change your password and contact your administrator.`,
    html: `<p>Your IMARA-CARE sign-in verification code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. If you did not try to sign in, change your password and contact your administrator.</p>`,
  });
}

export async function getLocalPasswordResetCode(email: string) {
  if (!localPasswordResetMailboxEnabled()) return undefined;

  const hashedEmail = emailHash(normalizedEmail(email));
  const result = await queryAuthDatabase<{
    code: string;
    expiresAt: string;
  }>(
    'SELECT code, expires_at AS "expiresAt" FROM auth_local_mailbox WHERE email_hash = ?',
    [hashedEmail],
  );
  const entry = result.rows[0];
  if (!entry) return undefined;

  if (Date.parse(entry.expiresAt) <= Date.now()) {
    await queryAuthDatabase(
      "DELETE FROM auth_local_mailbox WHERE email_hash = ?",
      [hashedEmail],
    );
    return undefined;
  }

  return entry.code;
}

export async function getLocalTwoFactorCode(email: string) {
  if (!localPasswordResetMailboxEnabled()) return undefined;

  const hashedEmail = emailHash(normalizedEmail(email));
  const result = await queryAuthDatabase<{
    code: string;
    expiresAt: string;
  }>(
    `SELECT code, expires_at AS "expiresAt"
       FROM auth_local_two_factor_mailbox
       WHERE email_hash = ?`,
    [hashedEmail],
  );
  const entry = result.rows[0];
  if (!entry) return undefined;

  if (Date.parse(entry.expiresAt) <= Date.now()) {
    await queryAuthDatabase(
      "DELETE FROM auth_local_two_factor_mailbox WHERE email_hash = ?",
      [hashedEmail],
    );
    return undefined;
  }

  return entry.code;
}

async function consumeLocalTwoFactorCode(email: string) {
  await queryAuthDatabase(
    "DELETE FROM auth_local_two_factor_mailbox WHERE email_hash = ?",
    [emailHash(normalizedEmail(email))],
  );
}

async function recordFailedLogin(email: string) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const hashedEmail = emailHash(email);
  const result = await queryAuthDatabase<{
    failureCount: number;
    windowStartedAt: string;
  }>(
    `SELECT failure_count AS "failureCount",
            window_started_at AS "windowStartedAt"
     FROM auth_login_limits WHERE email_hash = ?`,
    [hashedEmail],
  );
  const previous = result.rows[0];
  const inWindow =
    previous !== undefined &&
    now - Date.parse(previous.windowStartedAt) < loginWindowMilliseconds;
  const failureCount = inWindow ? previous.failureCount + 1 : 1;
  const windowStartedAt = inWindow ? previous.windowStartedAt : nowIso;
  const lockedUntil =
    failureCount >= 5
      ? new Date(now + loginWindowMilliseconds).toISOString()
      : null;

  await queryAuthDatabase(
    `INSERT INTO auth_login_limits
          (email_hash, failure_count, window_started_at, locked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email_hash) DO UPDATE SET
           failure_count = excluded.failure_count,
           window_started_at = excluded.window_started_at,
           locked_until = excluded.locked_until`,
    [hashedEmail, failureCount, windowStartedAt, lockedUntil],
  );
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
  baseURL: authBaseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [...trustedOrigins],
  database: authDatabase,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
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
          const invitation = token ? await findActiveInvitation(token) : undefined;
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
      otpOptions: {
        digits: 6,
        period: 10,
        allowedAttempts: 5,
        storeOTP: "hashed",
        sendOTP: async ({ user, otp }) => {
          await sendTwoFactorOTP(user.email, otp);
        },
      },
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
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: true,
      rateLimit: { window: 60, max: 3 },
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "forget-password") return;
        await sendPasswordResetOTP(email, otp);
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
      "/two-factor/send-otp": { window: 60, max: 3 },
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
        const result = await queryAuthDatabase<{
          lockedUntil: string | null;
        }>(
          'SELECT locked_until AS "lockedUntil" FROM auth_login_limits WHERE email_hash = ?',
          [emailHash(email)],
        );
        const limit = result.rows[0];
        if (limit?.lockedUntil && Date.parse(limit.lockedUntil) > Date.now()) {
          await recordAuthAudit("login.locked", { facilityId, email });
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many sign-in attempts. Try again in 15 minutes.",
          });
        }
        return;
      }

      if (
        ctx.path === "/email-otp/request-password-reset" ||
        ctx.path === "/two-factor/send-otp"
      ) {
        getAuthMailer();
        return;
      }

      if (ctx.path === "/email-otp/reset-password") {
        if (await passwordHasBeenBreached(ctx.body?.password)) {
          throw new APIError("BAD_REQUEST", {
            message: "Choose a password that has not appeared in known data breaches.",
          });
        }
        return;
      }

      if (ctx.path !== "/sign-up/email") return;

      const token = ctx.headers?.get("x-imara-invite-token");
      const invitation = token ? await findActiveInvitation(token) : undefined;
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
        const invitation = token ? await findActiveInvitation(token) : undefined;
        if (!invitation) return;

        await queryAuthDatabase(
          `UPDATE staff_invitations
             SET used_at = ?
             WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
          [new Date().toISOString(), invitation.id],
        );
        await recordAuthAudit("invite.accepted", {
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
          await queryAuthDatabase(
            "DELETE FROM auth_login_limits WHERE email_hash = ?",
            [emailHash(email)],
          );
        } else if (email && !twoFactorChallenge) {
          await recordFailedLogin(email);
        }
        await recordAuthAudit(
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

      if (ctx.path === "/email-otp/reset-password") {
        const response = ctx.context.returned;
        if (
          typeof response === "object" &&
          response !== null &&
          "success" in response &&
          response.success === true
        ) {
          await recordAuthAudit("password.changed", {
            facilityId,
            email: ctx.body?.email,
          });
        }
      }

      if (
        ctx.path === "/two-factor/verify-totp" ||
        ctx.path === "/two-factor/verify-otp" ||
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
          if (
            ctx.path === "/two-factor/verify-otp" &&
            "email" in response.user &&
            typeof response.user.email === "string"
          ) {
            await consumeLocalTwoFactorCode(response.user.email);
          }
          const pendingSetup =
            ctx.path === "/two-factor/verify-totp" &&
            (
              await queryAuthDatabase(
                "SELECT user_id FROM auth_mfa_setup_pending WHERE user_id = ?",
                [userId],
              )
            ).rowCount;
          if (pendingSetup) {
            await queryAuthDatabase(
              "DELETE FROM auth_mfa_setup_pending WHERE user_id = ?",
              [userId],
            );
            await recordAuthAudit("mfa.enabled", { actorUserId: userId, facilityId });
          } else {
            await recordAuthAudit("login.success", { actorUserId: userId, facilityId });
          }
        }
      }

      if (ctx.path === "/two-factor/enable" && ctx.context.session) {
        await queryAuthDatabase(
          `INSERT INTO auth_mfa_setup_pending (user_id, started_at)
             VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET started_at = excluded.started_at`,
          [ctx.context.session.user.id, new Date().toISOString()],
        );
      }
    }),
  },
});

export { authDatabase };
