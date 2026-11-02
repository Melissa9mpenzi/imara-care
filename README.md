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
npm run auth:migrate
npm run auth:create-admin -- --email admin@example.com --name "Platform Administrator" --role admin
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API URL can be overridden in `.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

`auth:setup` creates a private `.env.local` with a random Better Auth secret and local database settings. It does not overwrite existing values. After creating the first administrator, sign in and use **Invite staff** to issue a 48-hour invitation. In local development, the one-time invitation URL is shown to the signed-in administrator; set the `SMTP_*` values in `.env.local` to deliver invitations by email. Passwords are Argon2id-hashed, checked against the Pwned Passwords range API using its k-anonymity protocol, and staff account creation requires a valid invitation.

## PostgreSQL and Prisma foundation

The Prisma schema and seed command provide the first PostgreSQL foundation for facilities, staff identity/session data, invitations, audit events, roles, permissions, and recovery/security records. The existing Better Auth runtime and API continue using their current local SQLite databases until the PostgreSQL migration has been applied and the account data has been deliberately migrated.

Docker Desktop is required to start the local PostgreSQL service. From the project root:

```powershell
Copy-Item .env.example .env
# Edit .env and replace POSTGRES_PASSWORD with a unique local password.
docker compose up -d db
```

In another PowerShell window, configure the same connection for Prisma and the API. URL-encode special characters in the password:

```powershell
$env:DATABASE_URL = "postgresql://imara:YOUR_LOCAL_PASSWORD@localhost:5432/imara_care?schema=public"
Set-Location C:\Users\HP\Desktop\Imara-Care\web
npm run db:generate
npm run db:migrate -- --name auth_and_tenancy
npm run db:seed
```

Set `DATABASE_URL` in `backend/.env` to the equivalent SQLAlchemy URL:

```text
postgresql+psycopg://imara:YOUR_LOCAL_PASSWORD@localhost:5432/imara_care
```

The seed creates the demo facility, system roles, and permission catalogue; it does not create administrator accounts or passwords. It is safe to rerun and does not overwrite existing role permission assignments. `npm run db:deploy` applies checked-in migrations in a deployment environment. PostgreSQL startup and migration could not be exercised on this machine because Docker Desktop is not installed.

Platform administrators, facility administrators, medical directors, clinicians, and pharmacists must enroll an authenticator app before accessing staff data. During setup, scan the QR code (or enter the manual key), save the ten one-time recovery codes, and confirm a six-digit code. Sign-in requires a fresh authenticator code or an unused recovery code; five failed second-factor attempts lock the account for 15 minutes. Other staff can enable MFA from **My security**. MFA secrets and recovery codes are encrypted in the Better Auth database.

The authentication database is `web/imara-care-auth.db`; the clinical demo database remains `backend/imara-care.db`. Both are local SQLite databases and are excluded from Git.

## Checks

```powershell
npm run typecheck
npm run build
```

This is a development/demo MVP, not a production-ready clinical system. Staff authentication currently includes invite-only password enrollment, administrator-issued invitations, facility-scoped API sessions, account lockout, and authenticator-app MFA with recovery codes for sensitive staff roles. OAuth, passkeys, password reset, detailed role-based clinical permissions, multi-facility host resolution, and production email delivery must be completed and reviewed before real patient data is used.
