---
title: M65 Timesheets — review before merge
date: 2026-10-22
branch: feat/m65-timesheets
base: main (7e1461b)
status: awaiting review
---

# M65 Timesheets — review before merge

**For:** the reviewer approving `feat/m65-timesheets` into `main`.
**Read time:** about 10 minutes. Everything needed to decide is on this page; the detail is linked.

---

## 1. What this delivers

Deployed consultants record their days and hours; the Resource Manager approves them; approved days supply the leave on invoice lines instead of it being typed by hand.

| Who | Gets | Screen |
|---|---|---|
| Consultant (`resource` role) | Their own timesheet per deployment — daily or task style — submit, see status, fix rejected days. No salary, billing or margin is ever sent to them. | `/timesheet` |
| Resource Manager | A queue of submitted days, grouped by consultant and by week (or day / month). Approve, reject with a reason, bulk approve. | `/approvals` |
| Admin | Holiday calendar (company-wide or per client); timesheet settings on each deployment and project; invoices that take leave from approved timesheets. | `/holidays`, deployment and project pages, `/invoices` |
| Management | Can view all of the above, change nothing. | — |

Closes gaps **G-RES-01 to 04** and **G-RM-01**. Implements decisions **D1, D2, D3, D9, D10, D11**. Full spec: [`docs/plans/mxxwork/m65work/FSD-18-timesheets.md`](FSD-18-timesheets.md).

## 2. Decisions needed from the Product Owner

The build uses a default for each. **Each one changes what a client is billed**, so please confirm or change before release.

| # | Question | Built as (default) | Alternative |
|---|---|---|---|
| Q1 | Rounding hours to days. On an 8-hour day, how is 6 hours billed? | Nearest half day → **1 day** (same rule leave already uses) | Round down → 0.5 day |
| Q2 | Someone logs 4 of 8 hours and marks nothing else. | The missing half is **unpaid leave** (comes off the bill) | Ignore the shortfall (bills a full day) |
| Q3 | When do timesheets override the leave typed on an invoice? | Only when **every** working day of the line's period is approved; otherwise the line stays manual and shows "11 of 22 days approved" | Override with whatever is approved so far |
| Q4 | Holidays "per client or location". | Company-wide and per client. **Location is not possible** — nothing in the app records a location. | Add a location field to resources/clients (separate work) |

Each is a small, contained change if the answer differs.

## 3. How it fits the existing system

- **Access** is added only in `lib/access.ts`, the single policy file. `resource` and `resource_manager` leave the "pending" list; `accounts` and `interviewer` stay pending. Every new page and route passes the existing chokepoint scan.
- **"Only your own rows"** for a consultant is enforced in `lib/timesheets.ts`: they can only reach deployments of the resource record their login is linked to. Another person's deployment answers "not found".
- **No money leaks:** responses to consultants and the Resource Manager are built field by field (allowlist), so billing, commission, overhead and CTC are never in them.
- **The invoice formula is unchanged.** `invoiceLineMath()` was not edited. Only where the two leave inputs come from changed, and the server — not the browser — decides (`withTimesheetLeave()` in both invoice save routes). The invoice's pre-GST total stays an editable field, as before.
- **Derived numbers are never stored or trusted from the browser:** days worked and leave are computed from the rows each time (`lib/timesheet-rules.ts`).

## 4. Database changes — additive only

| Change | Default (keeps today's behaviour) |
|---|---|
| New table `timesheet_entries` | — |
| New table `holidays` | — |
| `deployments.timesheet_version` | null = use the project's default |
| `deployments.full_day_hours` | 8 |
| `deployments.approval_cadence` | weekly |
| `projects.timesheet_version` | v1 (daily) |
| `invoice_resources.leave_from_timesheet` | 0 (false) |

Nothing is dropped or renamed, so the current `main` code keeps working against the new schema. **The migration must run on production before this code is deployed** (`npm run db:migrate`, Product Owner only). It was run on the test database on 21 Oct 2026 and twice on a scratch copy; the second run changed nothing, as intended.

## 5. Evidence it works

| Check | Result |
|---|---|
| Type check (`tsc --noEmit`) | Clean |
| `npm test` | **268 passed, 12 files.** New: 31 baseline tests pinning today's invoice and money maths (`lib/utils.test.ts`), written **before** any change; 29 timesheet-rule tests (`lib/timesheet-rules.test.ts`). Extended: access tests for the two roles (`lib/accounts/roles.test.ts`, now 21) and the chokepoint scan, which now covers the new pages and routes (99 checks). |
| End-to-end on the test database, through the running app, as each role | **61 of 61 passed** — sign-in and landing pages; every refusal (consultant, Resource Manager, TA, Management); no money in any consultant or queue response; validation; the full save → submit → reject → fix → resubmit → approve → locked cycle; holidays; settings; invoice feed. |
| Invoice feed, worked by hand | September, fully approved, line sent with 0 leave → stored paid leave 1.5, unpaid 1, **21 of 22 days, ₹2,10,000** (220,000 × 21 ÷ 22). October, partly approved, typed leave 2 → kept as typed. |
| `npm run build` | **Not yet run** — run by the developer before the PR (cannot run while the dev server is up). |
| Click-through in a browser | Pages load and every button's server behaviour is verified; a manual click-through per role is recommended — steps in §7. |

## 6. Risks and how they are contained

| Risk | Containment |
|---|---|
| Wrong number on a client invoice | Formula untouched and now covered by baseline tests; timesheets only override leave when the whole period is approved; the line is marked "from timesheet". |
| ~60 consultant logins could see salary or billing | Server-side allowlist shapes; end-to-end check asserts the fields are absent. |
| No CI gate; `main` auto-deploys to Vercel | Tests and build must be run by hand before merge; migration before deploy. |
| Shared test database | Mock data command (`npm run db:seed-timesheets`) only adds rows and does nothing if timesheets already exist. |

## 7. How to try it (test database, about 10 minutes)

Run `npm run dev`, open http://localhost:3000. Password for all mock accounts: `Local@12345`.

1. **Consultant** — `resource.one@example.com` → lands on `/timesheet`. This week shows submitted, rejected (with a reason) and draft days; last month is approved. Fix the rejected day, Submit week. Try opening `/invoices` — you are sent back.
2. **Resource Manager** — `anita.desai@example.com` → lands on `/approvals`. Approve one day, reject one (a reason is required), bulk approve a group.
3. **Admin** — `omkar.swami@techstalwarts.com` → Holidays: add one for next week, then see it pre-filled on the consultant's timesheet. Open a deployment → Timesheet panel → Edit. New invoice on project 1 for **September** with resource 1 and 22 working days → leave fills 1.5 paid / 1 unpaid, locked, 21 of 22 days billed. Change the period to this month → leave becomes editable and shows "N of M days approved".

## 8. Not in this change (by the spec)

- Leave balances and reminders (G-RES-05), mobile app (G-RES-06), client sign-off upload (G-RES-07), expense claims (G-RES-08).
- **Admin override to unlock an approved timesheet** — specified as **G-ADM-01** (overrides with a reason and an audit trail, together with reopening invoices and forcing allocations). A separate item, not M65.
- Accounts and Interviewer screens (still on the holding page).

## 9. Files changed

**New**

| Area | Files |
|---|---|
| Rules and data | `lib/timesheet-rules.ts`, `lib/timesheets.ts`, `lib/timesheet-api.ts` |
| Tests | `lib/timesheet-rules.test.ts`, `lib/utils.test.ts` |
| Screens | `app/timesheet/`, `app/approvals/`, `app/holidays/`, `components/timesheet-settings.tsx` |
| API | `app/api/timesheets/` (mine, mine/day, mine/submit, approvals, summary), `app/api/holidays/`, `app/api/deployments/[id]/timesheet/`, `app/api/projects/[id]/timesheet/` |
| Scripts | `scripts/seed-timesheets.ts` (`npm run db:seed-timesheets`) |
| Docs | `docs/plans/mxxwork/m65work/` — `FSD-18-timesheets.md`, `2026-10-21-feat-m65-timesheets-plan.md`, this file |

**Modified**

| Area | Files |
|---|---|
| Access | `lib/auth.ts`, `lib/access.ts`, `lib/accounts/roles.test.ts` |
| Schema | `lib/schema.ts`, `lib/ddl.ts`, `scripts/migrate.ts`, `lib/validations.ts` |
| Invoices | `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, `app/invoices/client.tsx` |
| Detail pages | `app/deployments/[id]/page.tsx`, `app/projects/[id]/page.tsx` |
| Scripts | `scripts/seed.ts`, `scripts/clean.ts` (clear the two new tables), `package.json` |
| Docs | `README.md`, `CLAUDE.md`, `docs/fsd/` FSD-00, FSD-00A, FSD-01, FSD-09, FSD-10, FSD-12, README |

## 10. Reviewer checklist

- [ ] Q1–Q4 confirmed by the Product Owner, or changes requested
- [ ] `npm test` passes (268) and `npm run build` passes on the branch
- [ ] Click-through in §7 done for at least the consultant and Admin invoice steps
- [ ] Migration scheduled on production **before** the deploy
- [ ] Approve merge into `main`
