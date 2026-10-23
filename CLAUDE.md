# Resource Deployment Management — working instructions

Internal staffing platform for Techstalwarts: consultant deployments, client
engagements, agreements/POs and invoice collection. Next.js 14 (App Router),
TypeScript, libSQL/Turso, Drizzle, Tailwind, Zod, jose.

Read this file first. `README.md` is the setup and business-rules reference;
`docs/PLATFORM-VISION.md` is where the product is going; `docs/WAYS-OF-WORKING.md`
is the process the product owner expects; `docs/HANDOVER.md` is onboarding and
the known-issues list.

---

## 1. Hard rules

**Plan before you build.** Present a module-wise plan and wait for the product
owner's approval before writing code. This holds for mid-project additions, not
just kickoff. Details and the living-plan URL: `docs/WAYS-OF-WORKING.md`.

**Never point local development at production.** In this clone, `.env` holds
the credentials of a **test** Turso database, not the Vercel production one
(confirmed 21 Oct 2026). `npm run dev` and every `npm run db:*` script read it,
so a plain `npm run dev` works against shared test data: fine to seed with mock
data, but `db:seed` and `db:clean --commit` still wipe it for everyone using it.

Development uses **mock data only** (decided 21 Oct 2026). Only the Product
Owner holds production credentials, deploys, and runs migrations against the
production database. Never put production credentials in `.env`. If a clone's
`.env` might hold them, check with the Product Owner before running anything.

To work against a private local file database instead:

```bash
TURSO_DATABASE_URL="" TURSO_AUTH_TOKEN="" npm run dev
```

With both unset the app uses `./data/deployment.db`.

**`npm run db:seed` is destructive.** It clears tables before loading demo data.

**Migrations are additive only.** Never drop or rename a column. `deploy.sh`
rolls back by running the *previous* image against the *newer* schema, so old
code must still work. Add columns in `lib/ddl.ts`; `scripts/migrate.ts` applies
them idempotently.

**Run the migration before deploying the code that needs it**, so production
never runs new code against an old schema.

**Do not run `npm run build` while `npm run dev` is running.** Both write
`.next` and the dev server starts throwing `MODULE_NOT_FOUND`.

---

## 2. Deployment reality

Production is **Vercel, deployed from `main`**. Pushing to `main` ships to
users.

AWS/EC2 hosting is **not in scope** as of 2026-10-21 (product owner's
decision). The README's "Deploying" section, `Dockerfile`, `deploy/` and
`.github/workflows/build.yml` all still describe the EC2 model with a
`develop` branch and `release-*` tags. **That section of the README is stale** —
treat this file as current. Leave the AWS files in place; they are not wired to
anything and may be revived.

`staffing.techstalwarts.com` is a separate Apache deployment whose purpose is
unsettled. Do not assume it serves the current code.

**There is no CI test gate.** The only workflow builds AWS images on `release-*`
tags. Nothing runs `npm test` on push, and `main` auto-deploys. Until that is
fixed, run `npm test` and `npm run build` yourself before every push.

---

## 3. Architecture invariants

**The libSQL driver is async.** Every query is awaited and `db.transaction()`
takes an async callback. When a helper reads inside a transaction (the
allocation guard during opportunity conversion), pass the `tx` handle through so
it sees uncommitted writes.

**Access control lives in one place: `lib/access.ts`.** `middleware.ts` enforces
route access and write permission for every path, so a new API route is covered
by the policy the moment it exists. Do not add per-route role checks — extend
the policy. There are **nine** roles:

`admin`, `management`, `ta`, `leadgen`, `sales`, `accounts`,
`resource_manager`, `interviewer`, `resource`

`accounts` and `interviewer` are in `PENDING_ROLES`: assignable and able to
sign in, but held at `/welcome` until their screens exist. `resource` (lands on
`/timesheet`) and `resource_manager` (lands on `/approvals`) left it with M65.
`management` is view-only everywhere.

**Two server-side chokepoints re-check the account on every request** —
`requireCurrentAccount()` on pages, `handle()` on API routes — because Edge
middleware cannot read the database. `tests/chokepoints.test.ts` fails the build
if a page or route skips its chokepoint. Honour it; do not add an exemption to
make a test pass.

**Public response shapes are built by explicit allowlist**, never by deleting
fields from an internal object (`lib/jobs.ts`). A delete-list starts leaking the
moment someone adds a column.

**Role-based field hiding is enforced on the server, not the page.** When TA
must not see client budget, the API route strips it too — `stripClientBudget`
nulls `budgetMin`, `budgetMax` *and* `dealValue`. Pages stripping it alone was a
real leak.

**Money is never converted between currencies.** AED/INR/USD figures are
grouped by currency and summed within it. An invoice locks its FX rate at
creation. `formatMoney(value, currency)` and `formatMoneyCompact` — there is no
`formatINR`.

**`opportunityValue()` returns `null`, never `0`.** Most opportunities have no
budget; zero would read as "worth nothing" and poison every average. Null
renders as an em dash.

**Derived money is always recomputed server-side** from its inputs, never taken
from the request body — invoice `billed_days` and per-line `amount` especially.

**Agreement renewals are append-only.** Renewing inserts a new row linked by
`parent_agreement_id`. `PUT` is deliberately limited to number/title/notes.

**Invoice status is forward-only**; pipeline stages are bidirectional. Both are
in `README.md` under Business rules, with the pro-rating formula.

**Zod unions must put `z.literal('')` first.** `z.coerce.number()` happily
matches an empty string as `0`, which silently wrote zeros.

---

## 4. Code conventions

- Pages are server components querying the database directly for first paint;
  mutations go through REST under `/api`.
- Per module: `app/<module>/page.tsx` (server, initial data) +
  `client.tsx` (interactive table and forms) + `app/api/<module>/`.
- `lib/validations.ts` Zod schemas are shared by the API *and* the CSV
  importers, so an imported row is one the UI would have accepted.
- Shared UI primitives are in `components/ui.tsx` — Modal, Field, Badge,
  AllocationBar, Stat, tables. Use them rather than new one-off components.
- GST is 18% (`GST_RATE` in `lib/utils.ts`).
- Comments explain *why*, especially where a choice looks wrong without the
  history. Match the density of the surrounding file.

**When changing a shared signature, change it so the compiler finds every call
site.** Renaming `formatINR` to `formatMoney(value, currency)` forced all 56
call sites to be revisited instead of leaving silent wrong-currency output.

---

## 5. Testing

`npm test` (Vitest) — **322 tests across 13 files**, ~3s. Read that number
carefully: **118 of the 322 are `tests/chokepoints.test.ts`**, a structural scan
that generates one assertion per page and route. Of the rest, 102 cover accounts,
roles and authentication, 31 pin today's invoice and money maths
(`lib/utils.test.ts`), 29 cover timesheet rules, 29 cover leadgen rules
(`lib/leadgen-rules.test.ts`), 7 cover CSV export and 6 cover mail.

Behavioural coverage of business logic outside accounts is therefore close to
zero:

| Covered | Not covered at all |
|---|---|
| Accounts, roles, access policy | Invoice and timesheet API routes (hand-verified) |
| Google sign-in, password links | Deployments, agreements, POs |
| Invoice line maths, pro-rating, currency sums, `opportunityValue()` | Every Zod schema in `validations.ts` |
| Timesheet hours-to-days and the invoice feed rules | Leadgen API routes (hand-verified against a scratch DB) |
| Leadgen stage, conversion, duplicate matching, campaign maths, row access | |
| CSV export, mail, chokepoint scan | |

The pure money functions now have baseline tests (M65). The routes that call
them do not: treat changes there as unguarded, verify by hand, and prefer
adding a test to the change you are making.

Verify a claim against the database or the served bundle, not against a label.
A `200` response and a changed chunk hash both prove nothing about whether a
deploy actually swapped in.

---

## 6. Where things are documented

| File | Holds |
|---|---|
| `README.md` | Setup, auth, business rules, CSV import, data cutover. Deploying section is stale. |
| `docs/PLATFORM-VISION.md` | The nine departments, the end-to-end journey, settled decisions D1–D8, Tally integration facts. |
| `docs/WAYS-OF-WORKING.md` | Plan-then-build, the FSD update rule, compound-engineering loop, living artifact URLs. |
| `docs/HANDOVER.md` | Onboarding, environment hazards, known issues and outstanding security items. |
| `docs/fsd/` | 14 functional specs, one per module, plus the feature-gap register (FSD-00A). |
| `docs/plans/` | Approved implementation plans, as markdown. |

**Every plan's final unit updates the affected file in `docs/fsd/`**: bump the
module version, add a revision row, move shipped FS items to FR items. Definition
of Done includes that update. See `docs/WAYS-OF-WORKING.md`.
