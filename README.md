# IMARA-CARE Web

The Next.js frontend for IMARA-CARE, a hospital management system. This MVP provides a responsive facility dashboard, patient registration and search, appointment scheduling, visit check-in, triage, and department queues.

## Requirements

- Node.js 20.9 or later
- npm
- The IMARA-CARE API running at `http://localhost:8000` (or configure `NEXT_PUBLIC_API_URL`)

## Setup

```powershell
npm install
npm run auth:setup
# Configure AUTH_DATABASE_URL in .env.local for the PostgreSQL auth schema.
npm run auth:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API URL can be overridden in `.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

`auth:setup` creates a private `.env.local` with a random Better Auth secret and local settings. It does not overwrite existing values. Set `AUTH_DATABASE_URL` to a PostgreSQL connection for the `auth` schema before running `auth:migrate`. For an existing SQLite auth database, run `npm run auth:migrate:sqlite-to-postgres` after the schema migration and before starting Next.js; do not run `auth:create-admin`, because migration preserves existing accounts. For a new installation with no SQLite accounts, run `npm run auth:create-admin -- --email admin@example.com --name "Platform Administrator" --role admin` after the schema migration. After creating or migrating accounts, sign in and use **Invite staff** to issue a 48-hour invitation. In local development, the one-time invitation URL is shown to the signed-in administrator; set the `SMTP_*` values in `.env.local` to deliver invitations by email. Passwords are Argon2id-hashed, checked against the Pwned Passwords range API using its k-anonymity protocol, and staff account creation requires a valid invitation.

Staff can use **Forgot password?** on the sign-in page to request a six-digit OTP sent to their registered email. Codes expire after 10 minutes, are stored hashed, allow five verification attempts, and are rate-limited. Passwords must contain at least 12 characters and must not appear in known breach data. Resetting a password revokes existing sessions; authenticator MFA remains enabled. This works for platform and facility administrators as well as other staff. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `.env.local` to deliver reset codes; reset requests return a service-unavailable response until email is configured.

For local development only, set `LOCAL_AUTH_MAILBOX=true` in `.env.local` to use the in-app development mailbox when SMTP is not configured. A reset code is held locally for up to 10 minutes and shown only on the local password-reset page. This mailbox is disabled outside `NODE_ENV=development`; configure SMTP for production and never enable or expose a development server with real accounts.

## PostgreSQL

The local PostgreSQL database `imara_care` stores clinical records in the `public` schema and Better Auth accounts, sessions, MFA records, invitations, and authentication audit data in the separate `auth` schema. The web app connects using the least-privilege PostgreSQL role configured in `AUTH_DATABASE_URL` in the private `web/.env.local` file; do not use the PostgreSQL superuser as the web app's database role.

To migrate an existing local authentication database, start PostgreSQL, configure `AUTH_DATABASE_URL`, then run these commands from `web` before starting Next.js:

```powershell
npm run auth:migrate
npm run auth:migrate:sqlite-to-postgres
npm run dev
```

The first command creates Better Auth's tables in the PostgreSQL `auth` schema. The second makes a timestamped backup of `imara-care-auth.db`, copies all authentication and local-support records, checks the destination is empty before writing, and verifies copied row counts. It refuses to overwrite a non-empty PostgreSQL auth table. Keep the SQLite database and backup until PostgreSQL sign-in and MFA have been confirmed.

The clinical API uses the separate `DATABASE_URL` in `backend/.env` and continues to use the `public` schema. `AUTH_DATABASE_URL` is only for the web authentication service. The Prisma schema describes a separate foundation but is not part of this SQLite-to-PostgreSQL authentication migration. `npm run build` generates the Prisma client before running the Next.js build; client generation does not connect to a database.

Platform administrators, facility administrators, medical directors, clinicians, and pharmacists must enroll an authenticator app before accessing staff data. During setup, scan the QR code (or enter the manual key), save the ten one-time recovery codes, and confirm a six-digit code. At sign-in, MFA-enrolled users can choose an authenticator code, an emailed six-digit code, or a recovery code. Email codes expire after 10 minutes, allow five attempts, and are rate-limited. Email is less secure than an authenticator app or passkey, including for administrators. Other staff can enable MFA from **My security**. MFA secrets and recovery codes are encrypted in the Better Auth database.

To send reset and sign-in codes through Gmail, enable Google 2-Step Verification and create an App Password. In `web/.env.local`, configure `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` and `SMTP_FROM` to your Gmail address, and `SMTP_PASSWORD` to the App Password. Do not use your regular Google password or commit the App Password. Restart the web server after changing environment settings. In local development, the explicitly enabled local mailbox remains available when the SMTP App Password has not been added yet; it is disabled outside development.

The original authentication SQLite database and its migration backups, along with the clinical SQLite demo database, are excluded from Git.

## Checks

```powershell
npm run typecheck
npm run build
```

This is a development/demo MVP, not a production-ready clinical system. Staff authentication currently includes invite-only password enrollment, administrator-issued invitations, facility-scoped API sessions, account lockout, password reset, and authenticator-app MFA with recovery codes for sensitive staff roles. OAuth, passkeys, detailed role-based clinical permissions, multi-facility host resolution, and production email delivery must be completed and reviewed before real patient data is used.
