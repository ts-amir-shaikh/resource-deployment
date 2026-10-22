---
title: M65 Timesheets & Resource Self-Service - Plan
type: feat
date: 2026-10-21
topic: m65-timesheets
artifact_contract: ce-unified-plan/v1
product_contract_source: docs/plans/2026-10-21-scope-m62-m67-four-modules.md
execution: code
status: draft — awaiting approval
---

# M65 Timesheets & Resource Self-Service — Plan

## Goal Capsule

- **Objective:** deployed resources record their working days and hours; the Resource Manager approves them; approved figures feed invoice lines.
- **Covers:** G-RES-01, G-RES-02, G-RES-03, G-RES-04, G-RM-01. FSD-18 (outline in FSD-00 §4; the full FSD is written in U8).
- **Decisions it implements:** D1 (resource login), D2 (RM approves), D3 (day-wise, cadence by setting), D9 (hours and day type, `days = hours ÷ full-day hours`), D10 (version per deployment, project default), D11 (task rows with durations, one table).
- **Why it is risky:** it changes where invoice inputs come from, and the invoice maths has no tests (scoping risk R2). U1 writes those tests before anything else.
- **Stop conditions:** stop and ask before any `npm run db:*`; before editing `invoiceLineMath()` itself; and on Q1–Q4 below.
- **Not in scope:** leave balances and reminders (G-RES-05), mobile app (G-RES-06), client sign-off upload (G-RES-07), expenses (G-RES-08), weekend/overtime billing, the Tally feed.

---

## Open questions

| # | Question | Proposed default |
|---|---|---|
| Q1 | **Rounding hours to days.** On an 8-hour day, 6 hours = 0.75. Nearest half day bills it as **1**; rounding down bills **0.5**. | Nearest half day — the existing `roundHalf`, the same rule leave already uses. |
| Q2 | **A short day with no leave marked.** Someone logs 4 of 8 hours and marks nothing else. Is the missing half **unpaid leave** (comes off the bill) or ignored? | Counts as **unpaid leave** unless the resource marks that half as paid leave. Otherwise a short day silently bills as full. |
| Q3 | **When do timesheet figures override typed ones on an invoice?** | When every working day of the line's period has an **approved** entry, the server uses the timesheet leave figures and the form locks them. Otherwise the line stays manual and the form shows what is approved so far. |
| Q4 | **Holiday calendar scope.** G-RES-03 says "per client or location", but resources and clients have no location field. | Company-wide holidays plus per-client holidays. Location is deferred. |

Approval cadence (D3 "by setting") is set **per deployment**, default **weekly**. It groups the approval queue; it never blocks entry.

---

## Product contract

### Actors

- **Resource** — leaves `PENDING_ROLES`. Linked to a resource record by `users.resource_id` (already exists).
- **Resource Manager** — leaves `PENDING_ROLES`.
- **Admin** — configures versions, full-day hours, cadence and holidays; can do everything.
- **Management** — view-only.
- **Accounts** — stays pending (that is M62). Admin prices invoices as today.

### Requirements

- **R1. Self-service (G-RES-01).** A resource sees its own profile and its own deployments — project, client, dates, status — and **never** billing, CTC, commission, overhead or margin. A resource with no linked resource record sees an explanation, not an error.
- **R2. Two versions (D10, D11).** Each deployment has a timesheet version; when unset it uses its project's default (`v1`).
  - **v1 daily:** one row per day — day type, hours, short task note.
  - **v2 tasks:** several rows per day, each a task with a duration; they sum to the day.
  - One table holds both.
- **R3. Day types (G-RES-02).** `worked`, `half_day`, `paid_leave`, `unpaid_leave`, `holiday`. Holidays pre-fill from the calendar (R7) and can be overridden if the resource worked.
- **R4. Hours → days (D9).** Each deployment has `full_day_hours`, default 8. A day's worked value = hours ÷ full-day hours, capped at 1, rounded per Q1. A shortfall follows Q2. Computed on the server, never taken from a request body.
- **R5. Lifecycle.** `draft → submitted → approved`; or `submitted → rejected` (with a reason) `→ draft` again. Approved entries are locked. Entries only on dates inside the deployment's start/end.
- **R6. Approval queue (G-RM-01, D2).** The RM sees submitted entries grouped by resource and cadence period. Approve, reject with a required reason, bulk approve.
- **R7. Holiday calendar (G-RES-03).** Admin keeps company-wide and per-client holidays (Q4).
- **R8. Invoice feed (G-RES-04).** For an invoice line (resource + invoice period, on the invoice's project), the app totals approved entries: paid leave days, unpaid leave days (including Q2 shortfalls). The invoice form pre-fills them with a "from timesheet" marker; the server applies Q3 on save. `invoiceLineMath()` stays the one formula — only its inputs' source changes.

### Access

| Role | Can open | Can write |
|---|---|---|
| resource | `/timesheet`, own profile and deployments | own entries in `draft` or `rejected` |
| resource_manager | `/approvals`, resources and deployments **without money fields**, holidays | approve / reject entries |
| admin | everything | everything |
| management | everything | nothing |
| ta, leadgen, sales | unchanged — no timesheet access | — |

Money fields are removed **on the server** for resource and resource_manager, by an allowlist of fields (not by deleting fields), as `lib/jobs.ts` does.

### Acceptance examples

- **AE1.** A resource on two projects — one v1, one v2 — gets the daily form on the first and task rows on the second.
- **AE2.** On an 8-hour deployment: 8 h → 1 day; 4 h → 0.5 day; 10 h → 1 day (capped); 6 h → per Q1.
- **AE3.** A resource requesting another resource's timesheet or deployment gets 403/404; no response to a resource contains `billing_amount`, `current_ctc`, `commission_amount` or margin.
- **AE4.** RM rejects a day with a reason → resource sees the reason, edits, resubmits → RM approves → the entry can no longer be edited.
- **AE5.** A March invoice line for a resource with every working day approved, including 2 unpaid leave days, saves with `unpaid_leave_days = 2` even if the request body said 0; billed days and amount equal `invoiceLineMath` with those inputs.
- **AE6.** The same line with half of March approved stays manual, and the form shows "11 of 22 days approved".
- **AE7.** A company-wide holiday on 31 March pre-fills as `holiday` for every resource's March timesheet.

---

## Planning contract

### Key technical decisions

- **KTD1.** Access only through `lib/access.ts` — new prefixes, write rules and landing paths. Row-level ("only my own resource") lives in a helper beside `lib/ownership.ts`, called from the routes.
- **KTD2.** Migrations additive only: new tables and new defaulted columns.
- **KTD3.** One entries table for both versions (D11). A day's status is the status of its rows; approve/reject act on all rows of a (deployment, date).
- **KTD4.** `invoiceLineMath()` is not edited. U1 pins its behaviour; U6 only changes where `paidLeaveDays` / `unpaidLeaveDays` come from.
- **KTD5.** Responses to resource and resource_manager are built by allowlist.
- **KTD6.** Zod schemas in `lib/validations.ts`, `z.literal('')` first in unions.
- **KTD7.** Every new page calls `requireCurrentAccount()`, every route `handle()`; `tests/chokepoints.test.ts` passes with no exemption.

### System-wide impact

| Area | Change |
|---|---|
| `lib/auth.ts` | `resource`, `resource_manager` removed from `PENDING_ROLES` |
| `lib/access.ts` | New prefixes, write rules, landing paths, nav items |
| `lib/schema.ts`, `lib/ddl.ts`, `scripts/migrate.ts` | 2 tables, 4 columns |
| Deployments and projects forms | Version, full-day hours, cadence fields (admin) |
| Invoices form + `POST/PUT /api/invoices` | Timesheet pre-fill and Q3 enforcement |
| `scripts/seed.ts` or a fixture | Timesheet and holiday mock data |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Invoice maths changes with no tests. | U1 first; `invoiceLineMath` not edited; U1's tests must still pass after U6. |
| R2 | ~60 resource logins could see salary or billing. | Allowlist shapes; tests asserting forbidden fields are absent from every resource-facing response. |
| R3 | No CI gate; `main` auto-deploys. | `npm test` and `npm run build` before every push. Work on a branch; the Product Owner merges. |
| R4 | Q2 changes what clients are billed. | Not built until Q2 is answered. |

---

## Implementation units

### U1. Money-path baseline tests
Tests for today's behaviour of `invoiceLineMath`, `billedDaysLabel`, `invoiceLineRow`, `sumByCurrency`, `nextInvoiceStatus`, `deploymentMoney`, `opportunityValue`. No behaviour change. Any bug found is reported, not fixed silently.

### U2. Schema
- `projects.timesheet_version` (default `v1`).
- `deployments.timesheet_version` (null = project default), `deployments.full_day_hours` (default 8), `deployments.approval_cadence` (default `weekly`).
- `timesheet_entries`: deployment, entry date, day type, hours, task, status, submitted at, reviewer, reviewed at, rejection reason, timestamps.
- `holidays`: client (null = company-wide), date, name.

### U3. Domain logic — `lib/timesheets.ts`
Effective version; hours → days (Q1, Q2); status transitions; holiday pre-fill; period summary of approved entries for an invoice line, with coverage ("11 of 22 days"). Unit tests for every rule and AE2.

### U4. Access
Roles lifted; prefixes, write rules, landing paths (`/timesheet` for resource, `/approvals` for RM); row-level helper; allowlist response shapes. `lib/accounts/roles.test.ts` cases for both roles, and tests that forbidden money fields are absent.

### U5. API and screens
- `/api/timesheets` (own entries; create, edit, submit), `/api/timesheets/approvals` (RM queue, approve, reject, bulk), `/api/timesheets/summary` (invoice pre-fill), `/api/holidays`.
- `/timesheet` — resource: week view, v1 day rows or v2 task rows, submit, rejection reasons.
- `/approvals` — RM queue.
- `/holidays` — admin calendar.
- Deployment and project forms gain the new settings.
- Built from `components/ui.tsx`.

### U6. Invoice integration
Invoice form fetches the summary per line and pre-fills with the marker. `POST` and `PUT /api/invoices` apply Q3 server-side. U1's tests still pass unchanged.

### U7. Mock data
Approved, submitted and rejected entries on seeded deployments, both versions, and a holiday calendar — so AE1–AE7 can be checked by hand.

### U8. Docs
Write FSD-18 (kept in `docs/plans/mxxwork/m65work/` with this plan); update FSD-01 (two roles live), FSD-10, FSD-12, FSD-00A (G-RES-01 to 04, G-RM-01), README business rules, CLAUDE.md test count.

---

## Verification contract

- `npm test` and `npm run build` pass, including chokepoints, U1 baselines and U3/U4 tests.
- AE1–AE7 checked by hand in the browser as resource, resource manager and admin, using the mock accounts.
- Migration run against the test database only; production migration is the Product Owner's.

## Definition of Done

Built on a branch; tests and build green; AE1–AE7 verified; mock data in place; FSD-18 written and the affected FSDs and FSD-00A updated; this plan marked `status: shipped`.
