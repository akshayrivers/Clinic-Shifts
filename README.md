# Clinic Shift Scheduler

A small clinic's staff-shift management website. Managers create shifts and assign staff; staff members claim/unclaim shifts for themselves. Built as a fullstack take-home, see `PROJECT_BRIEF.md` for the original spec and `DECISIONS.md` for the reasoning behind everything below.

## Features

- Role-based authentication
- Shift creation and editing
- Shift claim/unclaim
- Manager assignment
- CSV import pipeline
- Import history
- Recurring shift series
- Live dashboard updates
- Weekly coverage dashboard

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router), frontend + backend in one app |
| Runtime | Node.js |
| Database | PostgreSQL (Supabase-hosted, accessed directly via `pg`) |
| Realtime | Supabase Realtime (`postgres_changes` on `shifts` / `shift_claims`) |
| Auth | NextAuth (Credentials provider), JWT sessions |
| Password hashing | bcryptjs |
| Validation | Hand-rolled per-route checks (see `DECISIONS.md`) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript (strict) |
| Tests | Node's built-in test runner (`node:test`), run via `tsx` |

## Project Structure

```
app/
├── page.tsx                       # Landing / redirect
├── login/page.tsx                 # Login (staff code + email + password)
├── dashboard/page.tsx             # Post-login role router
├── staff/page.tsx                 # Staff view: browse + claim/unclaim shifts
├── manager/page.tsx               # Manager view: coverage dashboard, create/edit/delete shifts, recurring series
├── manager/import/page.tsx        # Manager-only CSV import + Import Report
└── api/
    ├── auth/[...nextauth]/         # NextAuth handler
    ├── users/                      # User listing (manager-only, for the assign picker)
    ├── shifts/                     # Shift CRUD
    │   └── [id]/claim/             # Claim / unclaim a shift
    ├── shift-series/                # Recurring shift series create / list / delete
    └── import/                     # CSV import (seed + manual upload share this)
components/
├── manager/manager-dashboard.tsx
├── staff/staff-dashboard.tsx
├── shared/week-coverage-dashboard.tsx
├── shared/types.ts
├── navbar.tsx
└── toast-container.tsx
hooks/
└── use-realtime-shifts.ts         # Supabase Realtime subscription -> debounced refetch
lib/
├── auth/                          # NextAuth options, session helpers, requireManager/requireStaff
├── db/                            # pg Pool, repositories, types
├── services/                      # import.service, shifts.service, shift-claim.service, shift-series.service
└── supabase/client.ts             # Supabase client (Realtime only, not used for CRUD)
scripts/
├── seed-import.ts                 # Seeds a manager login, then imports staff.csv + shifts.csv
└── migration-003-shifts-external-id.sql
tests/                             # node:test suites
staff.csv / shifts.csv             # The dirty spreadsheet exports (also used by manual re-import)
```

## Deployment

**Live URL:** https://clinic-shifts.vercel.app/


## Setup

```bash
cp .env.example .env    # fill in your values, see Environment Variables below
npm install
npm run seed             # seeds a manager login + imports staff.csv and shifts.csv
npm run dev               # starts the app on :3000
```

> There's no `docker compose up` here, the app talks directly to a Postgres instance (Supabase is the intended host, since it also powers the Realtime stretch goal), so the fastest path is a free Supabase project + the env vars below, then the three commands above.

Run the test suite with:

```bash
npm test
```

## Auth Model

Single mechanism, used by both roles: **NextAuth Credentials provider**, JWT session strategy (no server-side session store). The login form asks for three fields, not two:

- **Staff code**: the actual account identifier, taken straight from the CSV's `staff_id` column (or `9000+` for manually-seeded managers)
- **Email**
- **Password**

Staff code matters because the source CSV has legitimate cases of two different `staff_id`s sharing one email address, so email alone can't reliably identify who's logging in.

All imported staff share one default password (`clinic123`); the seeded manager's password is `manager123`. There is no self-serve password reset or forced-change flow, see `DECISIONS.md` for what a real deployment would need instead.

Role enforcement happens in two places:
1. **`middleware.ts`**: redirects unauthenticated requests to `/login`, and redirects staff away from `/manager/*` (and vice versa). This is a UX layer, not the source of truth.
2. **Every API route**: calls `requireManager()` / `requireAuth()` server-side, and the claim service independently checks "is this person acting on themselves, or are they a manager acting on someone else" before doing anything. Client-side role checks are never trusted.

## API Routes

Base URL: `http://localhost:3000`

### Auth, `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|--------------|
| * | `/api/auth/[...nextauth]` | none | NextAuth's own sign-in / session / callback routes |

### Users, `/api/users`

| Method | Endpoint | Auth | Description |
|--------|----------|------|--------------|
| GET | `/api/users` | Manager | List every user (id, staff code, name, email, role, profession, never the password hash). Powers the "assign staff" picker. |

### Shifts, `/api/shifts`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| GET | `/api/shifts` | Any authenticated user | none | List all shifts with their current claims. |
| POST | `/api/shifts` | Manager | `{ date, startTime, endTime, doctorsRequired?, nursesRequired?, receptionistsRequired? }` | Create a shift. Rejects if requirements are negative or all zero. |
| GET | `/api/shifts/:id` | Any authenticated user | none | Get one shift with its claims. |
| PUT | `/api/shifts/:id` | Manager | Same fields as create, all optional, plus `force?: boolean` | Edit a shift. If the change would leave a claimed profession over capacity, or would double-book a claimant's time elsewhere, responds `409` with a `violations` list instead of saving. Resubmitting with `force: true` proceeds: overlap violations get the offending claim automatically removed (and reported back in `removedClaims`); over-capacity violations are allowed through as a knowing override and don't remove anyone. |
| DELETE | `/api/shifts/:id` | Manager | none | Delete a shift (claims cascade with it). The frontend confirmation shows how many staff are currently assigned before deleting, but the server-side delete itself is unconditional once called. |

### Shift Claims, `/api/shifts/:id/claim`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| POST | `/api/shifts/:id/claim` | Any authenticated user | `{ userId? }` (manager only, ignored for staff) | Staff self-claim, or manager assigns a specific staff member. Rejected with a specific error/status if the profession is already at capacity, the user is already claimed on this shift, or it overlaps a shift they've already claimed. |
| DELETE | `/api/shifts/:id/claim?userId=` | Any authenticated user | none | Unclaim. Staff can only unclaim themselves; a manager can unclaim anyone. |

### Shift Series, `/api/shift-series`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| GET | `/api/shift-series` | Manager | none | List every recurring series. |
| POST | `/api/shift-series` | Manager | `{ startDate, untilDate, startTime, endTime, daysOfWeek: number[], doctorsRequired?, nursesRequired?, receptionistsRequired? }` | Creates the series record, then generates one real `shifts` row per matching date between `startDate` and `untilDate` (inclusive), all linked by `series_id`, in one transaction. Returns the created series and the full list of generated shifts. |
| GET | `/api/shift-series/:id` | Manager | none | Get one series with every shift (and its claims) that belongs to it. |
| DELETE | `/api/shift-series/:id` | Manager | none | Deletes the series and every linked shift (and their claims) in one transaction. This is the "delete the whole series" action, distinct from editing or deleting a single occurrence, which is just a normal `PUT`/`DELETE` on that one shift's own `/api/shifts/:id` route. |

### Import, `/api/import`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| GET | `/api/import` | Manager | none | List every past import batch (seed run included), newest first. |
| GET | `/api/import/:id` | Manager | none | Get one batch's full row list, plus computed counts (total, accepted, rejected, merged). |
| POST | `/api/import` | Manager | `multipart/form-data` (`file`, `type: "staff" \| "shifts"`) or `{ content, filename, type }` | Runs the uploaded CSV through the exact same import logic used by `npm run seed`, and returns a per-row report (accepted / merged / rejected + reason for each). |

The manager-only Import Report page (`/manager/import`) has two modes now: upload mode (upload a CSV, see the result) and history mode (loads on page open, lists every past batch, click into one for the same detail view with a link back to the list).

## Import Behavior (short version)

Full reasoning is in `DECISIONS.md`. Short version of what the importer does with the dirty CSVs:

- Identity for staff is `staff_id`, not email (the CSV has one email shared across two different staff IDs).
- A repeated `staff_id`/`shift_id` merges into (overwrites) the existing record rather than being silently dropped, and is logged as `merged`.
- Role/profession strings are normalized case-insensitively with a few known synonyms (`RN` becomes nurse, `MD` becomes doctor, etc.); anything unrecognized is rejected with a reason.
- Dates: ISO, `DD/MM/YYYY`, and `MM-DD-YYYY` are all accepted (fixed convention per separator); genuinely impossible dates are rejected.
- Shifts spanning midnight (`end <= start`) are treated as overnight and rolled to the next day, this includes a `12:00`-`12:00` row, which becomes a 24-hour shift rather than being rejected.
- Requirement strings like `nurses=3;doctors=1` are parsed into three integer columns at import time; free-text requirements ("two nurses and a doctor") are rejected rather than guessed at.

## Recurring Shifts (stretch goal)

A manager can create a series like "every Mon/Wed 08:00-16:00 until 2026-09-30" from the manager dashboard. Under the hood this generates one real shift row per matching date, all tagged with the same `series_id`, rather than storing a recurrence rule and computing occurrences on the fly. That choice means editing or deleting a single occurrence later needs no special "exception" handling, it's just a normal edit or delete on that one shift, going through the same capacity/overlap re-validation as any other shift. Deleting the entire series (a separate "Delete" action in the manager dashboard's series list) removes every linked shift and its claims at once. Full reasoning is in `DECISIONS.md`.

## Live Updates (stretch goal)

The manager and staff dashboards subscribe to Supabase Realtime's `postgres_changes` on the `shifts` and `shift_claims` tables. Any insert/update/delete triggers a debounced refetch (max once per 500ms) of whatever the current user is viewing, so if a shift fills up or a manager edits it, other people looking at it see the change without refreshing.

## Database Schema

```
users
├── id (UUID, PK)
├── staff_code (INTEGER, unique)      # from the CSV's staff_id; 9000+ reserved for managers
├── email (VARCHAR, duplicates allowed, not unique)
├── password_hash (TEXT)
├── full_name, role (manager/staff)
├── profession (doctor/nurse/receptionist, null for managers)
└── created_at, updated_at

shifts
├── id (UUID, PK)
├── external_id (INTEGER, unique)     # original shift_id from the CSV, or a generated sequence value for shifts created in-app (falls back to MAX(external_id)+1 if the sequence itself is ever missing). Shown in the UI as `#<external_id>` on both dashboards instead of the raw UUID.
├── starts_at, ends_at (TIMESTAMPTZ)  # collapsed from date+start+end so overnight shifts need no special-casing
├── doctors_required, nurses_required, receptionists_required (INTEGER)
├── series_id (nullable, FK)          # links a shift back to the recurring series that generated it, if any
├── created_by -> users.id
└── created_at, updated_at

shift_claims
├── id (UUID, PK)
├── shift_id -> shifts.id
├── user_id -> users.id                # who is actually claimed on the shift
├── claimed_by -> users.id             # who performed the action (self, or a manager)
├── unique(shift_id, user_id)          # concurrency backstop, see DECISIONS.md
└── created_at

shift_series
├── id (UUID, PK)
├── days_of_week (INTEGER[])          # 0 = Sunday through 6 = Saturday
├── start_time, end_time (TEXT, HH:mm)
├── doctors_required, nurses_required, receptionists_required (INTEGER)
├── until_date (DATE)
├── created_by -> users.id
└── created_at

import_batches
├── id (UUID, PK)
├── source_filename
├── imported_by -> users.id (nullable, null for the automatic seed run)
└── created_at

import_rows
├── id (UUID, PK)
├── batch_id -> import_batches.id
├── row_number
├── raw_data (JSONB)                   # the row exactly as it came out of the CSV
├── status (accepted / merged / rejected)
├── reason (nullable)
├── resulting_id (nullable)            # the users.id or shifts.id this row produced
└── created_at
```

**Note:** only one incremental migration (`scripts/migration-003-shifts-external-id.sql`) is currently checked into the repo, the base tables above were created directly against Supabase. See `DECISIONS.md` for the plan to fix that.

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | No | `development` | |
| `DATABASE_URL` | Yes | none | Postgres connection string (Supabase's pooled connection string works fine) |
| `NEXTAUTH_SECRET` | Recommended | a hardcoded dev fallback | Set a real value for anything beyond local dev |
| `NEXTAUTH_URL` | Recommended in production | none | The deployed app's own URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (for Realtime) | none | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (for Realtime) | none | Supabase anon/publishable key, client-side, used only for the Realtime subscription, not for CRUD |

## Seeded Login Credentials

After `npm run seed`:

| Role | Staff Code | Email | Password |
|------|-----------|-------|----------|
| Manager | `9001` | `manager@clinic.com` | `manager123` |
| Staff (doctor) | `121` | `marcus.whitfield@clinicmail.test` | `clinic123` |
| Staff (nurse) | `131` | `anya.haddad@clinicmail.test` | `clinic123` |
| Staff (receptionist) | `120` | `ben.marchand@clinicmail.test` | `clinic123` |

Every other row that survives import from `staff.csv` logs in the same way: their `staff_id` from the sheet as staff code, their (normalized) email, and `clinic123`. The full accepted/merged/rejected breakdown for every row is visible on the manager-only Import Report page (`/manager/import`) after re-running an import through the UI.

## Known Limitations

See `DECISIONS.md` for the full reasoning, but in short:

- No persisted schema migration for the base tables; only one incremental migration file is tracked, the rest was set up directly in the Supabase dashboard.
- No self-serve password reset; every imported account shares one default password.
- CSV parsing is hand-rolled (naive comma/newline split), not a proper CSV library.
- No dedicated automated test for shift series creation (day-of-week generation, whole-series delete) yet, though the pieces it's built on (shift create/edit) are tested.
