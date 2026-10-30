---
title: M63 Tally inbound — push from the bridge into this app
type: plan
date: 2026-10-30
branch: feat/m63-tally-inbound (from feat/m62-accounts-workspace)
status: built and tested locally — awaiting Product Owner approval; not pushed, no production migration
---

# M63 Tally inbound: push

## Flow

TallyPrime :9000 → `tally-bridge.exe` on the Accounts PC (local SQLite copy) →
HTTPS `POST /api/integration/v1/tally/records` with a read-write integration key →
Turso `tally_*` tables → **Tally Data** screen (`/tally`, Accounts / Admin / Management).

The bridge pushes only what changed since the last batch this app confirmed
(200), in batches of 200, about every 30 s while it runs. A failed push is
retried on its next run; the bridge never needs DB credentials.

## What was added (additive only)

| Piece | File |
|---|---|
| Tables `tally_companies`, `tally_records`, `tally_sync_runs` | `lib/ddl.ts`, `lib/schema.ts` |
| Push shape (Zod) and write rule (AlterID wins, never delete) | `lib/tally-rules.ts` (+ test) |
| Storage: one read + one libSQL batch per push, SQL guard `excluded.alter_id >= alter_id` | `lib/tally-store.ts` (+ test on in-memory libSQL) |
| Route, inside `integration(req, 'read-write', …)` | `app/api/integration/v1/tally/records/route.ts` |
| Read-only screen; `/tally` in Accounts read prefixes and NAV (BILLING) | `app/tally/page.tsx`, `lib/tally.ts`, `lib/access.ts` |

No existing table, column, route or rule changed. Nobody writes `/tally` from a
session (Accounts write rules do not include it; Management stays read-only).

## Rules

- Key = Tally GUID per company and entity; AlterID is the version. An older
  AlterID never overwrites a newer one; an identical resend changes nothing.
- A record deleted in Tally arrives with `isDeleted: true` and is kept, marked.
- Tally is the source; this app does not edit the mirror.

## Turning it on (Product Owner)

1. `npm run db:migrate` against production (creates the three tables).
2. `npm run db:integration-key -- "Tally bridge" read-write` — shown once.
3. On the Accounts PC: `tally-bridge.exe config set push https://<app>/api/integration/v1/tally/records <key>`,
   then `tally-bridge.exe sync` and `tally-bridge.exe autostart install`.

## Verified (30 Oct 2026, local file DB only)

`npm test` 511 passing; `tsc` clean; `npm run build` OK. End to end against the
fake Tally: 22 records inserted, resend ignored, a ledger edit updated with its
new AlterID, a deleted voucher marked `is_deleted = 1`, a wrong key refused
(401, logged), `/tally` redirects to login when signed out.

## Open

- FSD-20 (Accounting Sync) does not exist yet in `docs/fsd/`; it should be
  written when this is approved, per the Definition of Done.
- Mapping Tally ledgers (Sundry Debtors) to clients, and receipts / outstanding
  reconciliation, are later M63 units.
- Vercel Hobby is non-commercial by its terms; check the plan in use.
