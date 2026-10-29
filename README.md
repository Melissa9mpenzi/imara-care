# IMARA-CARE Web

The Next.js frontend for IMARA-CARE, a hospital management system. This MVP provides a responsive facility dashboard, patient registration and search, appointment scheduling, visit check-in, triage, and department queues.

## Requirements

- Node.js 20.9 or later
- npm
- The IMARA-CARE API running at `http://localhost:8000` (or configure `NEXT_PUBLIC_API_URL`)

## Setup

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API URL can be overridden in `.env.local`:

```text
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Checks

```powershell
npm run typecheck
npm run build
```

This is a development/demo MVP, not a production-ready clinical system. Staff authentication and server-enforced permissions must be implemented before real patient data is used.
