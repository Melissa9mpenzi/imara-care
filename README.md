# IMARA-CARE Web

The Next.js frontend for IMARA-CARE, a hospital management system. This MVP provides a responsive facility dashboard, patient registration and search, appointment scheduling, visit check-in, triage and audited Pharmacy/Laboratory handoffs, role-based department workspaces, and audit history.

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

Open [http://localhost:3000](http://localhost:3000). For local development, the API URL can be overridden in `.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Production builds use `https://imara-care-api.vercel.app/api/v1` so the deployed dashboard stays pointed at the confirmed API. `NEXT_PUBLIC_API_URL` only affects local development.

`auth:setup` creates a private `.env.local` with a random Better Auth secret and local settings. It does not overwrite existing values. Set `AUTH_DATABASE_URL` to a PostgreSQL connection for the `auth` schema before running `auth:migrate`. For an existing SQLite auth database, run `npm run auth:migrate:sqlite-to-postgres` after the schema migration and before starting Next.js; do not run `auth:create-admin`, because migration preserves existing accounts. For a new installation with no SQLite accounts, run `npm run auth:create-admin -- --email admin@example.com --name "Platform Administrator" --role admin` after the schema migration. Facility administrators can open **Staff directory** as a dashboard tab to view facility accounts and open a full-page staff profile without leaving the dashboard sidebar, or use **Invite staff** to issue a 48-hour invitation. Staff can open **Help & support** from the sidebar for common task guidance, email `melissampenzi@gmail.com`, or submit a support request; facility administrators can review and update requests. The support form explicitly prohibits patient identifiers, clinical details, passwords, and MFA codes. In local development, the one-time invitation URL is shown to the signed-in administrator; set the `SMTP_*` values in `.env.local` to deliver invitations by email. Passwords are Argon2id-hashed, checked against the Pwned Passwords range API using its k-anonymity protocol, and staff account creation requires a valid invitation.

Staff can use **Forgot password?** on the sign-in page to request a six-digit OTP sent to their registered email. Codes expire after 10 minutes, are stored hashed, allow five verification attempts, and are rate-limited. Passwords must contain at least 12 characters and must not appear in known breach data. Resetting a password revokes existing sessions; authenticator MFA remains enabled. This works for platform and facility administrators as well as other staff. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` in `.env.local` to deliver reset codes; reset requests return a service-unavailable response until email is configured.

For local development only, set `LOCAL_AUTH_MAILBOX=true` in `.env.local` to use the in-app development mailbox when SMTP is not configured. A reset code is held locally for up to 10 minutes and shown only on the local password-reset page. This mailbox is disabled outside `NODE_ENV=development`; configure SMTP for production and never enable or expose a development server with real accounts.

Staff can sign in with their email or username. New staff choose a username when accepting their invitation; existing staff can set one once in **My security**. Google sign-in is optional: configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` or the deployment environment, then register `https://<your-auth-domain>/api/auth/callback/google` as the Google OAuth redirect URI. Google sign-in is restricted to existing accounts with a locally verified matching email; it cannot create staff accounts. Staff with MFA enabled still complete the IMARA-CARE second step after Google sign-in.

Reception and records staff can import new patient records from CSV or `.xlsx` in the Patients tab. Download the header-only CSV template, fill it with patient details, upload it, and review the preview before importing; possible duplicates and invalid rows are skipped, and existing patient records are never changed. Pharmacy staff can import stock from the Pharmacy workspace using the same preview-first flow. Positive stock quantities require a batch number, expiry date of today or later, and receipt reference; matching inventory items require explicit confirmation before quantities are added. Expired and legacy untracked quantities are not dispensable, and eligible batches are consumed earliest-expiry-first. Both uploads are limited to 5 MB and 500 rows.

## PostgreSQL

The local PostgreSQL database `imara_care` stores clinical records in the `public` schema and Better Auth accounts, sessions, MFA records, invitations, and authentication audit data in the separate `auth` schema. The web app connects using the least-privilege PostgreSQL role configured in `AUTH_DATABASE_URL` in the private `web/.env.local` file; do not use the PostgreSQL superuser as the web app's database role.

To migrate an existing local authentication database, start PostgreSQL, configure `AUTH_DATABASE_URL`, then run these commands from `web` before starting Next.js:

```powershell
npm run auth:migrate
npm run auth:migrate:sqlite-to-postgres
npm run dev
```

The first command creates Better Auth's tables in the PostgreSQL `auth` schema. The second makes a timestamped backup of `imara-care-auth.db`, copies all authentication and local-support records, checks the destination is empty before writing, and verifies copied row counts. It refuses to overwrite a non-empty PostgreSQL auth table. Keep the SQLite database and backup until PostgreSQL sign-in and MFA have been confirmed.

The clinical API uses `DATABASE_URL` in `backend/.env` and continues to use the `public` schema. The web app prefers `AUTH_DATABASE_URL` for authentication and falls back to `DATABASE_URL`, using the separate `auth` schema. This lets a deployment use one PostgreSQL database for both services without mixing their tables. The Prisma schema describes a separate foundation but is not part of this SQLite-to-PostgreSQL authentication migration. `npm run build` generates the Prisma client before running the Next.js build; client generation does not connect to a database. On Vercel Production builds, a preparation script creates the `auth` schema if needed, applies Better Auth's migration only when required tables are missing, and verifies the result before the build proceeds. Preview builds do not modify the database.

Platform administrators, facility administrators, medical directors, clinicians, nurses, and pharmacists must enroll an authenticator app before accessing staff data. During setup, scan the QR code (or enter the manual key), save the ten one-time recovery codes, and confirm a six-digit code. At sign-in, MFA-enrolled users can choose an authenticator code, an emailed six-digit code, or a recovery code, then explicitly select **Verify code**. Email codes expire after 10 minutes, allow five attempts, and are rate-limited. Email is less secure than an authenticator app or passkey, including for administrators. Other staff can enable MFA from **My security**. MFA secrets and recovery codes are encrypted in the Better Auth database.

To send reset and sign-in codes through Gmail, enable Google 2-Step Verification and create an App Password. In `web/.env.local`, configure `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` and `SMTP_FROM` to your Gmail address, and `SMTP_PASSWORD` to the App Password. Do not use your regular Google password or commit the App Password. Restart the web server after changing environment settings. In local development, the explicitly enabled local mailbox remains available when the SMTP App Password has not been added yet; it is disabled outside development.

The original authentication SQLite database and its migration backups, along with the clinical SQLite demo database, are excluded from Git.

## Checks

```powershell
npm run typecheck
npm run build
npm run smoke:api
```

The API smoke check verifies the public health endpoint and confirms Pharmacy and Theatre routes are registered. Set `API_AUTH_TOKEN` to additionally check those routes with an authenticated staff token; use `API_BASE_URL` to check a different API deployment.

This is a development/demo MVP, not a production-ready clinical system. Staff authentication includes invite-only password enrollment, administrator-issued invitations, email or username sign-in, optional Google OAuth, facility-scoped API sessions, account lockout, password reset, and authenticator-app MFA with email OTP and recovery-code options for sensitive staff roles. API role permissions are enforced for facility, reception, records, clinical, nursing, and department workflows; nurses and department heads are scoped to their assigned department. Passkeys, multi-facility host resolution, production email delivery, and a full clinical security and compliance review are still required before real patient data is used.
