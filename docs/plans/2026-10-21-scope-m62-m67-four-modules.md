---
title: Leadgen, Timesheets, Reviews, Accounts & Tally - Module Scoping
type: scope
date: 2026-10-21
topic: m62-m67-four-modules
artifact_contract: ce-unified-plan/v1
product_contract_source: chat scoping 21 Oct 2026
execution: scoping
status: approved
---

# Leadgen, Timesheets, Reviews, Accounts & Tally — Module Scoping

## Goal Capsule

- **Objective:** turn the four features the Product Owner described on 21 Oct 2026 into buildable modules, and settle the decisions that change their data models before any code is written.
- **Means:** each feature maps to FSDs already proposed in FSD-00 and to gaps already registered in FSD-00A. This document decomposes them into six modules (M62–M67), records what differs from the existing specification, and raises **D9–D16** for the Product Owner.
- **Product authority:** the Product Owner (Techstalwarts).
- **Status:** D9–D16 were approved on 21 Oct 2026 as recommended. Each module now needs its own implementation plan, approved before it is built.
- **Stop conditions:**
  - Stop and ask before any `npm run db:*`. Those target production Turso.
  - Stop and ask before the bridge writes anything to TallyPrime. Those are the company's live books.
- **Who finishes:** the Product Owner settles D9–D16. A per-module implementation plan is then written and approved before that module is built.

---

## Product Contract

### Summary

Four features were described. They decompose into six modules because the Accounts role is a prerequisite for Tally, and Tally splits at the read/write boundary.

| Module | Covers | FSD | Gaps |
|---|---|---|---|
| **M62** Accounts workspace | Accounts role gets its screens: write agreements and invoices, see margin and CTC, client billing details, receipts, void and credit notes, PO consumption | FSD-11, FSD-12 | G-ACC-01 to 06 |
| **M63** Tally bridge — inbound | Bridge app on the Tally machine. Pulls ledgers, **expenses**, sales vouchers, receipts, outstanding. Mapping, sync log, reconciliation | FSD-20 ph.1 | G-TLY-01 to 08, 10, 13 to 16 |
| **M64** Tally bridge — outbound | Pushes voucher, proforma and tax invoice creation, and status updates. **Never delete or deactivate** | FSD-20 ph.2 | G-TLY-09 |
| **M65** Timesheets | Daily hours and tasks, in two admin-enabled versions. Resource self-service login. Resource Manager approval. Feeds invoice lines | FSD-18 | G-RES-01 to 04, G-RM-01 |
| **M66** Leadgen pipeline | Campaigns, prospects, contacts, activity tracking, lead temperature, handoff into the staffing pipeline | FSD-14, FSD-15 | G-LED-01 to 07 |
| **M67** Resource & account review | Health report, monthly account and performance reviews, client feedback on resources | FSD-17 | G-RM-02, 05, 07 |

### Actors

- A1. **Leadgen.** Owns campaigns, prospects, contacts and activities (M66). Hands a lead to Sales.
- A2. **Sales.** Picks up a lead and raises requirements from it (M66).
- A3. **Accounts.** Currently in `PENDING_ROLES` and lands on `/welcome`. M62 gives it screens; M63 and M64 give it the Tally sync, its health and reconciliation.
- A4. **Resource.** Currently in `PENDING_ROLES`. M65 gives it timesheet entry for its own deployments and nothing else.
- A5. **Resource Manager.** Currently in `PENDING_ROLES`. M65 gives it the approval queue; M67 gives it the skill matrix and the monthly reviews.
- A6. **Client contact.** Has no login. Whether M67 gives them one is **D13**.
- A7. **Admin.** Sets which timesheet version applies (M65) and retains overrides.
- A8. **Management.** View-only throughout, including the new modules.

### What differs from the existing specification

These are the substantive deltas between the Product Owner's 21 Oct description and what FSD-00/FSD-00A already say. Each becomes a decision below.

1. **Timesheets become hours-and-tasks, not day types.** FSD-18 and D3 specify day-wise entries of *worked / paid leave / unpaid leave / holiday*, because that is what invoice lines consume. The new description is **hours per day with task notes**. That is time tracking rather than attendance, and it breaks the direct feed into invoicing (G-RES-04), which pro-rates on **days**.
2. **Two timesheet versions, toggled on two axes.** "Enabled by admin for individual user and individual project" conflicts when one resource works on two projects set to different versions.
3. **Lead status is a temperature.** The description gives `new, cold, warm, hot`. FSD-15 gives a funnel stage: `new, contacted, meeting set, qualified, converted, dead`. These measure different things.
4. **Client feedback on resources is new.** FSD-17 and G-RM-05 specify *internal* reviews only. Feedback *from the client* introduces either a new external login or a record-on-behalf flow.
5. **Tally is now written to.** G-TLY-08 states "Tally is read-only in phase 1", and G-TLY-09 (outbound) is currently `Good to have`. The description puts voucher, proforma and tax invoice creation in scope. **G-TLY-09 must be promoted to Must**, which changes the FSD-00A counts again.
6. **Proforma invoices do not exist in the app.** Invoice status is `Not Raised → Raised → Pending to Collect → Collected`. A proforma is a pre-invoice document with no place in that lifecycle.
7. **Expense details are not in the inbound scope.** G-TLY-03 covers customer ledgers, sales vouchers, receipts and outstanding. Expenses are an addition.

### Decisions (D9–D16) — approved 21 Oct 2026

The Product Owner approved every recommendation below as written. They are recorded in FSD-00 Rev 1.2, and their consequences in FSD-00A Rev 1.5.

| # | Question | Decision (approved) | Why it matters |
|---|---|---|---|
| **D9** | Do timesheets record **hours** or **day types**, and how do hours become invoice billed-days? | Record **both**: hours and tasks for the client-facing record, and a derived day type for billing. Define a full day in hours per deployment (8 by default), so `days = hours ÷ full-day hours`. | Without a rule, M65 cannot feed invoices, and G-RES-04 — described in FSD-00 as the largest gain in billing accuracy — does not land. |
| **D10** | Is the timesheet version set per **user**, per **project**, or per **deployment**? | **Per deployment.** A deployment already *is* resource × project, so the conflict dissolves instead of needing a precedence rule. Admin sets it there, with a project-level default. | A per-user and per-project toggle has no defined answer when a resource sits on two projects set differently. |
| **D11** | In version 2, is "hourly updates" one entry **per clock hour**, or **task entries with durations** that sum to the day? | **Task entries with durations.** Same table as version 1, one extra row per task. Version 1 becomes the one-row-per-day case of the same model. | Per-clock-hour forces 8+ rows a day even when someone did one thing, and needs a second table. |
| **D12** | Is lead **temperature** (`cold/warm/hot`) a separate field from the funnel **stage**? | **Two fields.** Stage is where the lead is; temperature is how likely it is. Collapsing them loses the ability to say "qualified but cold". | Determines whether the leadgen board columns are stages or temperatures. |
| **D13** | Who enters **client feedback** on a resource — the Account Manager on the client's behalf, or the client through their own login? | **Account Manager records it first.** A client login is a later module: it needs the invited, expiring, scoped-access pattern from D5, and clients would see a screen no one has designed. | A client login is a significant security and scope addition, not a field on a form. |
| **D14** | Confirm **outbound Tally writes are in scope now**, reversing G-TLY-08. If so, what is the approval gate before a voucher is posted? | **Confirm, with an explicit approval step**: Accounts reviews a queued posting and releases it. Nothing posts automatically. | These are the company's live statutory books. The "never delete or deactivate" instruction becomes an allowlist of permitted actions in the bridge. |
| **D15** | Is a **proforma** a document the app owns, or only a Tally artefact? | **App-owned, as a pre-invoice state** ahead of `Raised`, so the forward-only lifecycle still holds. | Changes the invoice state machine, which is enforced server-side and returns 409 on backward moves. |
| **D16** | Which Tally **expense** groups are pulled, and what are they for — margin accuracy, reporting, or both? | **Indirect and Direct Expenses**, for reporting first. Feeding margin means reconciling against CTC estimates, which is G-TLY-11 and separate. | Determines how much of the chart of accounts the bridge reads. 529 ledgers came back unfiltered in the connectivity test. |

### Scope boundaries

In scope across M62–M67: the six modules above.

Not in scope, and deliberately so:

- **FSD-16 Interviewer Portal.** Not in the Product Owner's four. The role and schema exist; the screens stay unbuilt.
- **FSD-19 Reports.** Most useful once these modules produce data.
- **Client logins** of any kind, pending D13.
- **Payroll actuals from Tally** (G-TLY-11), **multiple Tally companies** (G-TLY-12).
- **Email sequences and calendar sync** for leadgen (G-LED-09).

---

## Planning Contract

### Key technical decisions

- **KTD1. Access comes from `lib/access.ts`, not from new route guards.** Four roles sit in `PENDING_ROLES` and land on `/welcome`. Each module lifts exactly one role out and adds its path prefixes to the policy. The table middleware then covers every new route the moment it exists.
- **KTD2. The Tally bridge is a separate application, connecting outward only.** No port is opened on the Tally machine; port 9000 stays bound to localhost. The bridge polls this app roughly once a minute for queued work, which is what makes "Sync now" possible without an inbound connection.
- **KTD3. Outbound Tally actions are an allowlist, not a filter.** The bridge may create and update. There is no delete or deactivate code path to disable — the capability is absent, matching how `lib/jobs.ts` builds public shapes by allowlist rather than by deleting fields.
- **KTD4. Tally sync is idempotent on Tally's own identifiers** — `GUID`, `MasterID`, `AlterID`. Re-running a sync never duplicates. Voucher requests are paged by month.
- **KTD5. `LINEERROR` inside an HTTP 200 is a failure.** Tally returns errors with a success status. The bridge must inspect bodies, not status codes.
- **KTD6. Migrations stay additive.** Six modules add tables; none alters or drops a column. Rollback runs older code against the newer schema.
- **KTD7. Derived money is recomputed server-side.** Timesheet-derived billed days follow the existing rule: computed from inputs on the server, never accepted from the request body.
- **KTD8. New Zod schemas are shared with any importer**, and put `z.literal('')` first in unions — `z.coerce.number()` matches an empty string as `0`.

### System-wide impact

| Area | Impact |
|---|---|
| `lib/access.ts` | Three roles lifted out of `PENDING_ROLES` (accounts, resource, resource_manager). New prefixes and write rules. `tests/chokepoints.test.ts` will fail until every new page and route has its account check. |
| `lib/schema.ts`, `lib/ddl.ts` | New tables for campaigns, prospects, contacts, activities, leads, timesheet entries, reviews, Tally mappings, sync runs and the posting queue. |
| `lib/validations.ts` | New Zod schemas. Currently untested — see Risks. |
| Invoices (FSD-12) | M65 changes where invoice line days come from. This is the highest-risk touch in the plan: the pro-rating code has no tests. |
| FSD-00A | G-TLY-09 promoted to Must. G-LED, G-RES, G-RM, G-ACC, G-TLY rows updated as each module ships. Counts change; the summary table is already stale at Rev 1.3 figures and must be corrected. |
| Vercel | The bridge is not deployed to Vercel. It runs as a Windows service on `DESKTOP-90812NU`. That is a second deployment target with its own release process. |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Outbound Tally writes hit live statutory books.** A wrong voucher is an accounting problem, not a bug. | D14's approval gate. Post to a Tally test company first. No delete capability in the code. Reconciliation (G-TLY-07) before trusting any run. |
| R2 | **M65 changes invoice pro-rating, which has no tests.** The money paths are the least covered code in the repo. | Write tests for the existing pro-rating behaviour *before* changing it, so the change is measured against a known-good baseline. |
| R3 | **No CI gate and `main` auto-deploys to Vercel.** Six modules of new work by a second developer with nothing running `npm test` on push. | Add the CI gate before M62 starts. This is the first task in `docs/HANDOVER.md` for that reason. |
| R4 | **No backup of the production database.** G-PLT-09 is worded against the abandoned AWS architecture, so nothing covers Turso. | Fix the backup before modules that write money records. |
| R5 | **Tally answers only while open with the company loaded**, on a laptop. | Health status distinguishes bridge offline, Tally not running and company not loaded (G-TLY-15). Missed runs catch up. |
| R6 | **Leadgen overlaps the existing pipeline.** `opportunities.company_name` with a null `client_id` already means "prospect". | M66 must reuse that, not create a second prospect concept. Converting a won opportunity already back-links every opportunity sharing a company name. |

---

## Development environment

Decided 21 Oct 2026: **the second developer works against a local database and mock data only.** No production or Vercel credentials are shared.

This works without any of the owner's keys:

```bash
cp .env.example .env.local      # set AUTH_SECRET and APP_PASSWORD only
npm run db:migrate && npm run db:seed
npm run dev
```

With `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` unset the app uses
`./data/deployment.db`. `scripts/seed.ts` creates no accounts, so the
`APP_PASSWORD` fallback stays open and signs in as Admin, which means Google
sign-in and SMTP are not needed. See `docs/HANDOVER.md` §1.

Consequences for these modules:

- **Deploys stay with the Product Owner.** The developer never pushes to production and never runs a migration against Turso.
- **Tally needs its own fixtures.** The bridge cannot be developed against the live `DESKTOP-90812NU` machine from a local-only setup. M63 and M64 need a Tally test company or recorded XML responses. That is a prerequisite for those modules, not an afterthought.
- **M65's invoice feed must be verified on seeded data**, which has no approved timesheets. Either extend `scripts/seed.ts` to cover the new tables, or ship each module with its own fixture.
- **Testing the pending roles needs real accounts.** Creating one closes the `APP_PASSWORD` door, and with no SMTP configured the Send-link flow cannot deliver a password. Use `npm run db:user`, which prompts, to make one account per role.

---

## Recommended build order

FSD-00's order was Accounts → Tally inbound → Timesheets → Interviewer → Leads → Campaigns → Resource Mgmt. For a **handover to a developer new to this codebase**, that order is wrong at the front.

| Order | Module | Why here |
|---|---|---|
| 0 | CI gate, money-path tests, backup | R2, R3, R4. None of the six should start without these. |
| 1 | **M66 Leadgen** | Best first module for a new developer: net-new tables, no money, no integration, does not touch untested invoice code. Mistakes are cheap and contained. |
| 2 | **M62 Accounts workspace** | Cheapest real module — role, account management and expiring access already exist, so it is screens on finished foundations. |
| 3 | **M65 Timesheets** | Largest billing-accuracy gain, but it touches invoice pro-rating. Needs R2 done and the codebase understood. |
| 4 | **M63 Tally inbound** | A second application, Windows service, XML parsing. Reading only, so the risk is bounded. |
| 5 | **M67 Resource & account review** | Needs timesheets to review against. |
| 6 | **M64 Tally outbound** | Last. Highest consequence in the project. Only after inbound reconciles cleanly for a full period. |

**Do not start a new developer on Tally.** It is a separate app, an unfamiliar protocol, a Windows deployment target and the company's live books at once.

---

## Verification Contract

Each module's own plan carries its acceptance examples. Module-independent requirements:

- `npm test` passes, including `tests/chokepoints.test.ts`, which fails if any new page or route skips its account check.
- Each module adds tests for its own business rules. For M65 this includes the pro-rating baseline from R2.
- Every new role path is asserted in `lib/accounts/roles.test.ts`: what the role may open, and that it may not open anything else.
- Verified against a local file database, never production. `TURSO_DATABASE_URL="" TURSO_AUTH_TOKEN=""`.
- Tally work is verified against a test company before any live company is touched.

## Definition of Done

For this scoping document: **done.** D9–D16 approved 21 Oct 2026, recorded in FSD-00 Rev 1.2. FSD-00A Rev 1.5 supersedes G-TLY-08, promotes G-TLY-09 to Must, adds G-TLY-18, G-ACC-10 and G-RM-09, and corrects the stale header figure — **57 Must and 35 Good to have**.

For each module afterwards: an approved implementation plan, built and verified, with the affected `docs/fsd/` files updated — version bump, revision row, FS items moved to FR items — as required by `docs/WAYS-OF-WORKING.md`.
