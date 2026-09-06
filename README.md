# Resource Deployment Management

Internal tool for managing and monitoring consultant deployments, client engagements,
agreements/POs, and invoice collection.

## Running it

```bash
npm install
cp .env.example .env.local   # set APP_PASSWORD and AUTH_SECRET
npm run db:migrate           # creates the schema
npm run db:seed              # optional — loads a realistic demo dataset
npm run dev
```

Opens at http://localhost:3000 and asks for the password in `APP_PASSWORD`.
With no Turso variables set, the database is a local libSQL file at
`data/deployment.db`.

Generate a signing secret with `openssl rand -base64 32`.

## Authentication

A single shared password gates the whole app. `middleware.ts` checks a signed,
httpOnly session cookie (JWT via `jose`, so it runs in the Edge runtime) on
every route, with two deliberate exceptions:

- `/share/*` and `/api/share/*` stay **public** — consultants must be able to
  open a shared requirement without an account.

API routes return `401` JSON rather than an HTML redirect. Sessions last 12
hours. There is one role and no per-user identity: everyone who signs in sees
everything, which is a scope choice for a small internal team.

## Deploying

Vercel + Turso, both free. See the runbook, or in short:

```bash
turso db create resource-deployment
TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npm run db:migrate
```

then set `APP_PASSWORD`, `AUTH_SECRET`, `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` in the Vercel project and deploy.

## Modules

| Module | Route | What it covers |
|---|---|---|
| Dashboard | `/` | Utilisation, billing, collection health, pipeline funnel, alerts |
| Pipeline | `/pipeline` | Opportunities across a 7-stage board, comments, sharing |
| Candidates | `/candidates` | Bench and externally sourced candidates |
| Resources | `/resources` | Consultant profiles, CTC revisions, skills |
| Clients | `/clients` | Companies with SPOC / Account Manager / Alternate SPOC |
| Projects | `/projects` | Engagements owned by a client |
| Deployments | `/deployments` | Resource→project mapping, billable & shadow |
| Agreements | `/agreements` | POs with immutable renewal history |
| Invoices | `/invoices` | Billing periods with 4-stage collection status |
| Share view | `/share/[token]` | Public, read-only requirement page for consultants |

## Business rules

These are enforced in the API layer, not just the UI.

**Allocation cap.** A resource's `allocation_percentage` across all *active*
deployments cannot exceed 100%. Both billable and shadow deployments consume
capacity. Violations return `409` with the remaining headroom, which the form
surfaces inline before submit.

A resource can therefore be:
- 100% billable on one project
- 60% billable on Client A + 40% billable on Client B (split billing)
- 80% billable on one project + 20% shadow on another (mixed)
- 100% shadow (non-billable, e.g. knowledge transfer)

**Shadow deployments** are normalised on write: `billing_amount`,
`commission_amount` forced to 0 and `gst_applicable` to false.

**Ending a deployment** sets `status = ended` and frees its allocation back to
the resource.

**Agreement renewals are append-only.** Renewing creates a *new* row linked via
`parent_agreement_id`; the previous row is marked `renewed`. Price and resource
changes are never edited in place, so every version stays diffable. `PUT` on an
agreement is deliberately restricted to number/title/notes.

**Invoice status is forward-only:**
`Not Raised → Raised → Pending to Collect → Collected`.
Moving to Raised stamps `invoice_date` if unset; moving to Collected stamps
`collected_date`. Backward transitions return `409`. Collected invoices cannot
be edited or deleted.

**Pipeline stages are bidirectional**, unlike invoices:
`Requirement → Qualification → Budgeting → Candidate Mapping → Interview → Agreement`,
with `Won / Lost / Hold` as terminal states. Deals regress in real life, so a
stage can move backwards; every move is logged to `opportunity_stage_history`.
Lost and Hold require a reason. Resuming from Hold returns the opportunity to
the stage it was parked at, read back from that history.

**Prospects are not a separate table.** `opportunities.company_name` is always
set and `client_id` is nullable — null means prospect. Converting a won
opportunity creates the client row and back-links *every* opportunity sharing
that company name.

**Candidate source** is `in_house | partner | agency`. `source_name` is required
for partner and agency, and forced to null for in-house. Only in-house
candidates may link to a bench `resource_id`. Interview progress lives on the
`opportunity_candidates` junction, not the candidate, because the same person
can sit at different rounds on different opportunities.

**Won → project conversion** creates the client (if a prospect), the project,
and for every candidate marked *joined* a bench resource plus a billable
deployment. Deployments respect the same 100% allocation cap; anyone without
headroom is reported back as skipped rather than silently dropped.

**Sharing is by unguessable token, with no authentication.** `/share/[token]`
exposes the requirement and JD only — never budget, client contacts, candidate
names, or internal stage. Anyone holding the link can read that page, which is
usually fine for a JD but is worth knowing before circulating one.

## Stack

Next.js 14 (App Router) · TypeScript · libSQL / Turso · Drizzle ORM ·
Tailwind CSS · Zod · jose

Pages are server components that query the database directly for first paint;
mutations go through the REST API under `/api`.

The libSQL driver is **async** — every query is awaited, and
`db.transaction()` takes an async callback. When a helper needs to read inside
a transaction (the allocation guard during opportunity conversion), pass the
`tx` handle so it sees uncommitted writes.

## Layout

```
app/
  page.tsx              dashboard
  <module>/
    page.tsx            server component — initial data
    client.tsx          interactive table + forms
  api/<module>/         REST routes
lib/
  schema.ts             Drizzle table definitions
  db.ts                 libSQL connection (Turso or local file)
  ddl.ts                schema DDL, shared by migrate and seed
  auth.ts               session signing + password check
  queries.ts            allocation guard, renewal chain, aggregations
  validations.ts        Zod schemas shared by API and forms
  api.ts               request parsing + error mapping
components/
  ui.tsx                Modal, Field, Badge, AllocationBar, Stat, tables
  sidebar.tsx
middleware.ts           auth gate; exempts /share/*
scripts/
  migrate.ts            applies the schema (idempotent)
  seed.ts               demo dataset (destructive — clears tables first)
```

## Notes

- **Do not run `npm run build` while `npm run dev` is running** — both write to
  `.next` and the production build overwrites the dev server's webpack chunks,
  which makes the running app throw `MODULE_NOT_FOUND`. Stop the dev server, or
  clear `.next` and restart it afterwards.
- GST is calculated at 18% (`GST_RATE` in `lib/utils.ts`).
- Amounts are stored as monthly figures; currency formatting uses the Indian
  numbering system (lakh/crore) in compact views.
- Delete operations are guarded — records with active deployments, linked
  agreements, or raised invoices cannot be removed.
