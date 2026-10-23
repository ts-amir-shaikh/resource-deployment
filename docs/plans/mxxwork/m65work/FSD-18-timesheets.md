# Timesheets & Resource Self-Service

`FSD-18 · TSH`

Deployed resources record their days and hours against each deployment. The Resource Manager approves them, and approved days supply the leave figures on invoice lines.

| Field | Value |
|---|---|
| Module code | TSH |
| Module version | v1.2 |
| Doc revision | Rev 1.2 |
| Status | `Built` — on branch `feat/m65-timesheets`, not yet released |
| Plan module | M65 |
| Appears as | My Timesheet · Timesheet Approvals · Holidays · Timesheet Dashboard |
| Screens | /timesheet · /approvals · /holidays · /timesheets (dashboard, Admin) · Timesheet panel on /deployments/[id] and /projects/[id] |
| Decisions | D1 D2 D3 D9 D10 D11 D17 D18 D19 D20 D21 (FSD-00 §6) |
| Gaps closed | G-RES-01 G-RES-02 G-RES-03 G-RES-04 G-RM-01 · G-RM-10 (v1.1) |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module, leave on an invoice was typed by hand per line. Timesheets make it a record: the resource enters each day, the Resource Manager approves it, and an invoice for a period with every working day approved takes its leave from those days.

v1.1 (built on the same branch) adds a **timesheet dashboard** (utilisation, billing coverage, shadow work, billed time with no client tasks) and a **fixed "No client tasks assigned" task** per billable project, so billed-but-idle time can be told apart. Plan: `2026-10-23-plan-m65-timesheet-dashboard.md`.

Not in scope: leave balances and reminders (G-RES-05), a mobile app (G-RES-06), client sign-off attachments (G-RES-07), expense claims (G-RES-08), billing weekend or overtime work, hourly billing (D21), logging training, learning, preparation or interviews in the timesheet (D17), internal tasks (D19, a future module).

## 2. Users and access

| Action | Admin | Management | Resource Mgr | Resource | TA / Lead Gen / Sales |
|---|---|---|---|---|---|
| Enter and submit own time | — | — | — | Yes, own deployments | — |
| See own profile and deployments (no money) | — | — | — | Yes | — |
| View approval queue | Yes | Yes | Yes | — | — |
| Approve and reject | Yes | — | Yes | — | — |
| Holiday calendar | Edit | View | — | — | — |
| Timesheet settings on deployments and projects | Edit | View | — | — | — |
| Invoice timesheet summary | Yes | Yes | — | — | — |
| **Timesheet dashboard (v1.1)** | Yes | **No** | **No** | — | — |

Resource and Resource Manager are no longer pending roles (FSD-01). A resource account must be linked to a resource record on the People screen; an unlinked one sees an explanation instead of a timesheet.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-TSH-001 | A resource sees its name, designation and its deployments — project, client, dates, status. No billing, commission, overhead, CTC or margin figure is in any response sent to a resource. | v1.0 | `Built` |
| FR-TSH-002 | Time is entered by day, per deployment. A day holds one or more work rows, each with a task and hours. Leave is not entered here: it comes from leave requests (FSD-21). | v1.2 | `Built` |
| FR-TSH-003 | **Versions, per deployment (D10, D11).** The setting stays (a deployment's own, else its project's default, which is v1). From v1.2 it no longer limits the entry screen: the weekly grid is the same for both, and a day may hold several tasks on either. | v1.0 | `Built` |
| FR-TSH-004 | Each day shows its hours, and whether it is a full day, short, over, a holiday or leave. | v1.2 | `Built` |
| FR-TSH-005 | Holidays from the calendar mark the day as a holiday and are not measured. The resource can add work to a holiday if they worked. | v1.2 | `Built` |
| FR-TSH-006 | **Lifecycle.** A day is Draft, Submitted, Approved or Rejected. The resource saves days as drafts and submits a week. Submitted and approved days cannot be edited. A rejected day shows its reason, can be corrected and submitted again. | v1.0 | `Built` |
| FR-TSH-007 | **Approval queue (G-RM-01).** Submitted days grouped by resource and by the deployment's cadence — daily, weekly or monthly. Approve or reject a day, approve a whole group, or select days across groups and approve or reject them together. A rejection requires a reason. | v1.0 | `Built` |
| FR-TSH-008 | **Holiday calendar (G-RES-03).** Admin adds holidays company-wide or for one client, and removes them. Removing a holiday does not change days already recorded. | v1.0 | `Built` |
| FR-TSH-009 | **Settings.** Admin sets, per deployment, the version, the hours in a full day (default 8) and the approval cadence (default weekly), and per project the default version. | v1.0 | `Built` |
| FR-TSH-010 | **Invoice feed (G-RES-04).** For each invoice line, the invoice form shows how many of the period's working days are approved. When all are, the line's paid and unpaid leave are filled from the timesheets and locked, and the server stores those figures whatever the form sent. Otherwise the line stays as entered and shows "11 of 22 days approved". | v1.0 | `Built` |
| FR-TSH-011 | **Timesheet dashboard (D20).** `/timesheets`, Admin only, with a period picker and filters by resource, client, project and deployment. Every headline figure counts approved time only; pending time is shown beside it. | v1.1 | `Built` |
| FR-TSH-012 | **Five tabs:** Overview, Resources, Deployments, Invoices, Activities. The Activities tab is the activity log, one row per resource per day: the total (green at a full day, red with the reason written beside it), what was worked on, and the status with who approved it and when, or the rejection reason. A day opens to the entries behind it. It is also the screen for approved and rejected time. | v1.1 | `Built` |
| FR-TSH-013 | **Statistics.** Client-work hours, no-client-task hours, shadow hours, leave and holiday hours, remaining hours, billable, task-backed, deployment and total utilisation, approval backlog and coverage ("N of M expected days approved"). | v1.1 | `Built` |
| FR-TSH-014 | **Links.** Resource, Deployment and Invoice pages show this month's figures and open the dashboard filtered to that record (FSD-07, FSD-10, FSD-12). | v1.1 | `Built` |
| FR-TSH-015 | **Fixed task "No client tasks assigned" (D17).** Every billable project has it automatically, with a fixed name. A resource picks it in the task field to say they were deployed and billed but had no client tasks. Refused on shadow deployments. | v1.1 | `Built` |
| FR-TSH-016 | **Invoice view.** The Invoices tab (loaded on its own, because each line is checked against the timesheets) reads each line's stored monthly rate, billed days, unpaid and paid leave and amount, totalled by currency and never converted or recomputed (D21). Lines raised before lines carried a rate show "—". Flags: raised while the period is only partly approved; leave typed by hand though the period is now fully approved; and a list of approved billable days with no invoice line. | v1.1 | `Built` |
| FR-TSH-017 | **Weekly grid.** Tasks are rows and the week's days are columns, each cell an hours box. A Total row shows each day green at a full day and red when short or over, with the reason written under the number ("4.75 h short"); a holiday turns its whole column red, and its cells stay open if the resource worked. The grid starts empty and the resource adds the tasks they worked on, each typed or chosen from tasks used before; "No client tasks assigned" is one of the choices (D17). Any week is reached from Month and Week drop-downs, arrows and Today. A week across two months shows both, and a Fill in switch picks the month that can be changed; the other month is view-only, and Save and Submit apply to the chosen month. Approved and submitted days show plain numbers. | v1.2 | `Built` |
| FR-TSH-018 | **Leave on the timesheet.** Approved leave shows as leave and reduces the hours expected that day; a pending request is marked. Leave rows entered before FSD-21 are kept when a day is saved. | v1.2 | `Built` |

## 4. Business rules

- **BR-TSH-01 Hours to days (D9).** A day's work = hours worked ÷ the deployment's full-day hours, capped at 1, rounded to the nearest half day. On an 8-hour day: 8 h = 1, 6 h = 1, 4 h = 0.5, 3 h = 0.5, 1 h = 0. *Rounding to the nearest half (not down) is a default awaiting Product Owner confirmation.*
- **BR-TSH-02 Short days.** (Paid leave is now recorded by approved leave requests, FSD-21, as well as by older timesheet rows.) On an expected working day, any part not covered by work or paid leave counts as unpaid leave. Logging 4 of 8 hours and nothing else is half a day unpaid. *Default awaiting confirmation.*
- **BR-TSH-03 Expected days.** Monday to Friday, less holidays that apply to the deployment's client. Weekends can be recorded but never create unpaid leave.
- **BR-TSH-04 Only approved days count.** A day with any row not approved counts for nothing in the invoice feed.
- **BR-TSH-05 When timesheets override an invoice.** Only when every expected day of the line's period is approved, across every deployment of that resource on the invoice's project. *Default awaiting confirmation.* Billed days and the line amount are still computed by the existing invoice formula (FSD-12 BR-INV-01); only its leave inputs change.
- **BR-TSH-06 Paid leave is billed, unpaid leave is deducted** — unchanged from FSD-12.
- **BR-TSH-07 Holidays** are company-wide or per client. There is no location rule, because nothing in the application records a location. *Default awaiting confirmation.*
- **BR-TSH-08 Derived values are never stored or accepted.** Days worked and leave are computed from the rows whenever needed (`lib/timesheet-rules.ts`).
- **BR-TSH-09 Two-level capacity (D18).** A deployment's expected hours = its expected working days × its hours a day. A resource's capacity = expected working days × the company standard day (8 h). A part-time deployment is therefore measured fairly against its own hours, and the person against a full day.
- **BR-TSH-10 Utilisation is time, not money (D21).** Billable utilisation = client-work hours (including no-client-task hours) ÷ resource capacity. Task-backed utilisation excludes no-client-task hours. It is **null, shown as "—", never 0**, when capacity is 0. Only approved time counts.
- **BR-TSH-11 Remaining hours** = capacity − client-work − shadow − leave − holiday, never below zero. Capacity already leaves out calendar holidays, so a holiday row counts here only on a day the calendar did not remove. It is where bench time and future internal tasks (D19) show.
- **BR-TSH-12 Billed time with no client tasks is billed (D17).** A "No client tasks assigned" row is an ordinary work row for hours-to-days and the invoice feed; only leave reduces the bill. BR-TSH-02 is unchanged. A day may be split between tasks, including this one.

## 5. Data

| Table | Holds |
|---|---|
| `timesheet_entries` | deployment, date, type, hours, task, status, submitted / reviewed by and at, rejection reason |
| `holidays` | date, name, client (null = company-wide) |
| `deployments` + | `timesheet_version` (null = project default), `full_day_hours` (8), `approval_cadence` (weekly) |
| `projects` + | `timesheet_version` (v1) |
| `invoice_resources` + | `leave_from_timesheet` — the line's leave came from approved timesheets |
| `timesheet_entries` + (v1.1) | `task_kind` — nullable; `NULL` = a normal row, `'no_client_tasks'` = the fixed task. Existing rows stay `NULL` |

All changes are additive; every default reproduces behaviour before the module.

## 6. Interfaces

| Route | Who | Does |
|---|---|---|
| `GET /api/timesheets/mine` | Resource | Own profile, deployments, entries and holidays for a date range |
| `PUT /api/timesheets/mine/day` | Resource | Replace one day of one own deployment |
| `POST /api/timesheets/mine/submit` | Resource | Submit draft and rejected days in a range |
| `GET/POST /api/timesheets/approvals` | Resource Mgr, Admin | Queue; approve or reject days |
| `GET /api/timesheets/summary` | Admin, Management | Approved figures for one invoice line |
| `GET/POST /api/holidays`, `DELETE /api/holidays/[id]` | Admin (Management reads) | Calendar |
| `PUT /api/deployments/[id]/timesheet` | Admin | Deployment settings |
| `PUT /api/projects/[id]/timesheet` | Admin | Project default version |
| `GET /api/timesheets/dashboard` (v1.1) | Admin | Statistics for a period and filters; `?part=invoices` returns the Invoices tab |
| `GET /api/timesheets/entries` (v1.1) | Admin | The activity log |

Mock data: `npm run db:seed-timesheets` (additive, after `npm run db:migrate`).

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M65 | First build. |
| v1.1 | M65 | Timesheet dashboard and the fixed "No client tasks assigned" task. |
| v1.2 | M65 | Weekly grid screen with month and week drop-downs; leave moves to its own module (FSD-21). |

## 8. Known limitations

- The four defaults marked above await Product Owner confirmation.
- A resource cannot see past approved weeks in summary form; they browse week by week.
- Internal tasks (training, learning, preparation, interviews) are a future module (D19). Until then that time shows as remaining hours.
- A day split between client tasks and no client tasks needs a v2 deployment.
- Changing a deployment's hours a day after approved days exist warns but does not lock; derived days re-value.
- The invoice's pre-GST total is still editable by design (FSD-12); it follows the lines unless overridden.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 21 Oct 2026 | v1.0 | First issue, written against branch `feat/m65-timesheets`. |
| 1.1 | 23 Oct 2026 | v1.1 | FR-TSH-011 to 016, BR-TSH-09 to 12, `task_kind`, dashboard routes, Admin-only access. Decisions D17 to D21. Specified first, then built on `feat/m65-timesheets` the same day. |
| 1.2 | 23 Oct 2026 | v1.2 | FR-TSH-002, 004 and 005 reworded; FR-TSH-017 and 018 added. The entry screen became a tasks-by-days grid; leave left the timesheet for FSD-21. |
