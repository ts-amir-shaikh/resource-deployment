---
title: M65 addendum — Timesheet dashboard and the fixed "No client tasks assigned" task
type: plan
date: 2026-10-23
status: built 23 Oct 2026 on feat/m65-timesheets — FSDs updated, tsc and 298 tests pass; migrated and checked on the shared test DB
affects: FSD-18 (Timesheets) → v1.1; small additions to FSD-10, FSD-07, FSD-12, FSD-01, FSD-00, FSD-00A
base: feat/m65-timesheets (built on this branch; no separate module number)
---

# M65 addendum: Timesheet dashboard

## 1. What is asked

A **dashboard inside the timesheet module**, with statistics about timesheets only, for the person who looks after deployed resources (the Resource Manager's job): are they utilised, are they billed, how much of their time is shadow work, and how much is billed time with **no client tasks assigned**. It is reached from the Resources, Deployments and Invoices screens. **For now, Admin only.**

## 2. Decisions (Product Owner, 23 Oct 2026)

Recorded in FSD-00 as D17–D21 (Rev 1.4).

| # | Decision | Effect on this plan |
|---|---|---|
| **D17** | **Training, learning, preparation and interviews are not logged in the timesheet.** A deployed resource who is available but has no client tasks (for example while being trained) **is billed**: billing follows availability on the deployment, and only leave reduces the bill. **Each project has a fixed task, "No client tasks assigned"**, that people log against, so this time can be identified. | No activity categories. One fixed task per billable project and one additive column on `timesheet_entries` (§6). The invoice rules are **not changed**. |
| **D18** | **Hours per day: 8 is the standard, configurable per deployment when it is marked.** A part-time or 50%-allocated deployment has fewer hours a day. | The hours-per-day field moves onto the deployment form, defaulting from allocation (§5). |
| **D19** | **Internal tasks (training, learning, preparation, interviews) are a future module**, assigned to resources and kept outside the timesheet, in their own table, going through the same approval queue. **Not developed now.** | Out of scope here. Hooks are noted in §8. |
| **D20** | **The timesheet dashboard is Admin only,** including its invoice amounts. | Explicit Admin-only rule (§7). |
| **D21** | **No hourly billing.** Billing stays the fixed monthly amount, pro-rated by days (FSD-12). Part-time is covered by hours a day and allocation. | Utilisation is measured in hours and is independent of the rate. The dashboard reads amounts from stored invoice lines and never recomputes them. |
| — | The dashboard has **tabs inside it** (By resource · deployment · invoice) **and** links from the Resource, Deployment and Invoice pages that open it filtered. | §5 |

## 3. What exists today (checked in the code, 23 Oct 2026)

| Need | Today |
|---|---|
| Record of time | `timesheet_entries`: one row per deployment, date, type (work / paid leave / unpaid leave / holiday), hours, free-text task, status. |
| Shadow work | A *deployment type* (`shadow`, no billing). Time on a shadow deployment is shadow work. |
| Hours a day | `deployments.full_day_hours` (default 8), set by Admin in the Timesheet panel of the deployment page **after** the deployment exists. Not on the create form. |
| Utilisation | Planned allocation % (FSD-07 BR-RES-03). **Not actual hours.** |
| Viewing approved or rejected time | **No screen.** `/approvals` shows only the pending queue. |
| Billing link | Approved days feed invoice leave (FR-TSH-010). No view comparing approved days with what was invoiced. |
| Hourly billing | **Not modelled, and not wanted (D21).** Billing is a monthly rate pro-rated by days (FSD-12). |
| Identifying billed time with no client tasks | **Not possible.** A task is free text only. |
| Who may open a new page | `lib/access.ts` lets **Management** open every path Admin can, so Admin-only needs an explicit rule. |

## 4. Scope

**In:** the dashboard, the activity log, links from three detail pages, hours-per-day on the deployment form, the fixed "No client tasks assigned" task per billable project, the Admin-only rule.

**Out:** activity categories for training, learning, preparation or interviews (D17), internal tasks (D19), hourly billing (D21), leave balances (G-RES-05), a report builder (FSD-19).

**Data:** **one additive, nullable column** on `timesheet_entries` (§6). **No invoice rule changes.**

## 5. The dashboard (route `/timesheets`, "Timesheet Dashboard")

A period picker (this month by default, or a week, or a custom range) and filters (resource, client, project, deployment). Every headline figure counts **approved** time only; submitted-but-pending time is shown beside it, never mixed in (BR-TSH-04).

### Tabs

| Tab | Shows |
|---|---|
| **Overview** | Headline stats; the approval backlog; the people with the most remaining hours. |
| **Resources** | One row per resource: capacity, client-work hours (of which **no client tasks**), shadow hours, leave, holiday, remaining, billable utilisation %. |
| **Deployments** | One row per deployment: allocation %, billable or shadow, hours a day, expected hours, approved hours and days (of which **no client tasks**), pending, rejected, timesheet version, deployment utilisation %. |
| **Invoices** | One row per invoice line: approved days of expected days, leave from timesheets or typed, billed days, and from the stored line: monthly rate, amount billed, and amount deducted for unpaid leave; flags (below). |
| **Activities** | Hours by kind over the period (client tasks, **no client tasks**, shadow work, leave, holiday, remaining) by resource; and the **activity log**: every entry with its task, status, who approved, any rejection reason. This is also the view of approved and rejected time that does not exist today. |

### Hours a day and capacity (D18)

Two levels, so a part-time deployment is measured fairly:

- **Deployment expected hours** = expected working days × that deployment's hours a day. A 50% deployment at 4 h a day over 22 days is **88 h**.
- **Resource capacity** = expected working days × the company standard day (8 h, a single setting). Over 22 days that is **176 h**, whatever mix of deployments the person is on.

The hours a day on a deployment already drives hours-to-days (BR-TSH-01), so the existing rule needs no change. A warning, not a block, is shown when one person's deployments add up to more than the standard day.

### Statistics

| Statistic | Definition |
|---|---|
| **Client-work hours** | Approved `work` hours on billable deployments, **including** hours logged against the fixed "No client tasks assigned" task (§6). They are billed. |
| **No-client-task hours** | Of the client-work hours, those logged against the fixed task. Shown as hours and as a share of client-work hours. |
| **Shadow hours** | Approved `work` hours on shadow deployments. |
| **Leave / holiday hours** | Approved paid and unpaid leave; holiday rows. |
| **Remaining hours** | Resource capacity − client-work − shadow − leave − holiday, never below zero. Labelled *bench, internal tasks, or not yet logged*; internal tasks are not tracked here (D19), so this is where they would show. |
| **Billable utilisation %** | Client-work hours (including no-client-task hours) ÷ resource capacity. Billing is the fixed monthly amount (D21), so this measures time, not money. |
| **Task-backed utilisation %** | (Client-work − no-client-task hours) ÷ resource capacity: the share of the person's time with real client work behind it. |
| **Deployment utilisation %** | Approved hours on the deployment ÷ its expected hours. |
| **Total utilisation %** | (Client-work + shadow hours) ÷ resource capacity. |
| **Approval backlog** | Submitted days waiting; age of the oldest; rejected days not yet resubmitted. |
| **Coverage** | "N of M expected days approved", the same figure invoices already show. |

Utilisation is **null, shown as "—", never 0**, when capacity is zero (a new joiner, a month of holidays). A 0% would read as idle.

### Invoice-side flags

- A period that is not fully approved but already has an invoice raised.
- A line whose leave was typed by hand although approved timesheets exist for that period.
- A deployment-month with approved billable days and **no** invoice line.

Money is read from the invoice line as stored (its monthly rate, billed amount and unpaid-leave deduction), **grouped by currency and never converted** (CLAUDE.md §3). The dashboard never recomputes an invoice amount; where a figure is needed it reuses `invoiceLineMath()`.

### Links from other screens

| From | Adds | Opens |
|---|---|---|
| Resource page | A "Timesheet" section with this month's utilisation and a link | `/timesheets?tab=resources&resource=ID` |
| Deployment page | This month's figures in the existing Timesheet panel, and a link | `/timesheets?tab=deployments&deployment=ID` |
| Invoice page | A line showing coverage, and a link | `/timesheets?tab=invoices&invoice=ID` |

## 6. The fixed task: "No client tasks assigned" (D17)

Every **billable** project has one fixed task, **"No client tasks assigned"**. On the entry screen the resource picks it from the task field (or types a normal task as today). It needs no setup per project: it exists for every billable project automatically, and its name is fixed.

- **Stored** as a new nullable column `timesheet_entries.task_kind` (`NULL` = a normal row; `'no_client_tasks'`). Every existing row stays `NULL`, so nothing existing changes. The enum can take other fixed tasks later without another migration.
- **Billing is unchanged.** The row is `work`, billable, counts toward hours-to-days exactly like any other work. Only leave reduces the bill. BR-TSH-02 (a short, unexplained day counts as unpaid leave) is as it was.
- **Billable deployments only.** A shadow deployment is not billed, so the fixed task is refused there, server-side.
- **Superseded (v1.2): the one-row-a-day limit was removed.** It read as follows:
- **Version 1 (one row a day):** the whole day is flagged. A day that is half client tasks and half no client tasks needs a **version 2 (Tasks)** deployment, which allows several rows a day. This is a limitation of v1, not a new rule.
- **Approval:** the queue shows the fixed task like any task; the Resource Manager approves or rejects as usual.
- **The dashboard** splits client-work hours into tasked and no-client-task (§5), per resource, per deployment, and in the log.

## 7. Access (D20)

| | Admin | Management | Resource Manager | Others |
|---|---|---|---|---|
| `/timesheets`, `/api/timesheets/dashboard` | Yes | **No** | **No** | No |

An **explicit Admin-only rule** in `lib/access.ts`, placed above the shortcut that lets Management in (as the export rule is), the sidebar entry limited to Admin, and tests in `lib/accounts/roles.test.ts` asserting Management, the Resource Manager and Sales are refused. The server functions take the viewer and keep money in separate sections, so opening the hours sections to the Resource Manager later is an access change, not a rewrite. Salary, CTC, margin and commission never appear on this dashboard.

## 8. Deferred: internal tasks (D19)

Not developed now. When it is, the shape agreed so far is: tasks assigned to resources (training, learning, preparation, interviews), their own table rather than a pseudo-deployment, the same approval queue, and no effect on billing. The dashboard's **Remaining hours** is where that time would be shown; no change to the dashboard's design is needed to receive it.

## 9. FSD changes (made 23 Oct 2026, ahead of the build)

| File | Change |
|---|---|
| **FSD-18** Timesheets | Module v1.0 → **v1.1**, Rev 1.1. §1 scope widened. FR-TSH-002 gains the fixed task. New FR-TSH-011 to 016: the dashboard, its five tabs, the statistics, the activity log, the links, the fixed task. New BR-TSH-09 to 12: the two-level capacity, utilisation and its null case, remaining hours, the fixed task is billed and billable-only. BR-TSH-02 gains the D17 note. §2 access gains the dashboard row. §5 data gains `task_kind`. §6 interfaces updated. §8 notes internal tasks as future and v1's one-row limit. |
| FSD-10 Deployments | FR for hours a day on the deployment form, defaulting from allocation. |
| FSD-07 Resources, FSD-12 Invoices | One FR each for the link and the figures added to the page. |
| FSD-01 Platform & access | One FR: the Admin-only dashboard rule. |
| FSD-00 | D17–D21 and a revision row. |
| FSD-00A Gap register | **G-RM-10** timesheet dashboard (closes part of G-RM-03). **G-RES-09** internal tasks, `Good to have`, deferred. Revision row. |
| README, CLAUDE.md | Test counts. |

## 10. Delivery units

1. **U1 Rules + tests.** `lib/timesheet-dashboard-rules.ts`: two-level capacity, buckets, utilisation with the null case, remaining hours, backlog.
2. **U2 Access + tests.** The Admin-only rule and navigation.
3. **U3 Deployment form.** Hours a day on the create and edit form, defaulting to 8 × allocation %, editable; the existing validation kept. Changing it after approved days exist shows a warning, not a lock, since derived days would re-value (agreed).
4. **U4 Fixed task.** The additive `task_kind` column (schema, DDL, idempotent migration); the row schema and server validation (billable deployments only); the entry screen's task field offering it; the approval queue showing it. Tests pin that a no-client-tasks row bills exactly as a normal work row.
5. **U5 Server.** `lib/timesheet-dashboard.ts`, `GET /api/timesheets/dashboard` and `/entries`. Allowlisted shapes, no salary, CTC, margin or commission.
6. **U6 Screens.** `/timesheets` with five tabs and filters.
7. **U7 Links.** Sections on the resource, deployment and invoice pages.
8. **U8 Mock data.** Extend `db:seed-timesheets`: shadow, part-time, no-client-task and varied-utilisation cases.
9. **U9 Docs.** The FSD changes above.

## 11. Verification

`npx tsc --noEmit`, `npm test` (rule tests, role tests, chokepoint scan), a scratch-database run of the server functions, then a manual walk-through as Admin with Management, the Resource Manager and Sales being refused. The 31 baseline invoice tests must be unchanged. `npm run build` is run by the user.

## 12. Acceptance examples

- **AE1** 22 expected days, 8 h standard: capacity 176 h. 120 approved client-work hours on a billable deployment give billable utilisation **68.2%** and 56 h remaining. With 40 more hours submitted but unapproved, the headline is unchanged and "40 h pending" appears beside it.
- **AE2** 16 approved hours on a shadow deployment show **16 h shadow**, counted in total utilisation but not billable utilisation.
- **AE3** A month that is all holidays shows capacity 0 and utilisation "—", not 0%.
- **AE4** A 50% deployment at 4 h a day over 22 days has 88 expected hours. With 80 approved, its deployment utilisation is **90.9%**, while the person's billable utilisation is **45.5%** of their 176 h capacity.
- **AE5** Management, the Resource Manager and Sales are redirected from `/timesheets` and refused on `/api/timesheets/dashboard`.
- **AE6** An invoice raised for a period with 11 of 22 days approved shows the flag and "11 of 22 days approved".
- **AE7** A rejected day appears in the activity log with its reason and the person who rejected it.
- **AE8** A resource logs 8 h against "No client tasks assigned" on a billable deployment: the day is billed in full, counts as client-work hours, and appears as 8 no-client-task hours; billable utilisation is unchanged and task-backed utilisation is lower (D17).
- **AE9** The same row on a shadow deployment is refused with a message.
- **AE10** On a v2 deployment, 4 h of a normal task and 4 h of "No client tasks assigned" on one day show 4 and 4; on a v1 deployment the whole day is flagged.
- **AE11** An invoice line shows the stored monthly rate, amount billed and unpaid-leave deduction; nothing on the page is recomputed, and amounts in different currencies are never added together.
- **AE12** A new deployment at 50% allocation opens its form with 4 hours a day; Admin can change it, with a warning if approved days exist.

## 13. Confirmed and still open

**Confirmed 23 Oct 2026:** a fixed task per project identifies no-client-task work (D17); hourly billing is not needed and utilisation rests on the fixed monthly amount (D21); editing hours a day after approvals warns rather than locks.

**Confirmed 23 Oct 2026 ("yes"):**
1. One fixed task, with a fixed name, **created for every billable project automatically** (no per-project setup, no renaming). A per-project task *list* that Admin manages would be a larger change, and the column in §6 can grow into it.
2. The fixed task is refused on shadow deployments.
3. A day that is part client tasks and part no client tasks needs a v2 deployment (§6).
