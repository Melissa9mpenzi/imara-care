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

The authentication database is `web/imara-care-auth.db`; the clinical demo database remains `backend/imara-care.db`. Both are local SQLite databases and are excluded from Git.

## Checks

```powershell
npm run typecheck
npm run build
```

This is a development/demo MVP, not a production-ready clinical system. The first staff authentication phase includes invite-only password enrollment, administrator-issued invitations, facility-scoped API sessions, and basic auth audit events. OAuth, MFA, passkeys, password reset, role-based clinical permissions, multi-facility host resolution, and production email delivery must be completed and reviewed before real patient data is used.
