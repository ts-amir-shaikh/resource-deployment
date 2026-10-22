# Timesheets & Resource Self-Service

`FSD-18 · TSH`

Deployed resources record their days and hours against each deployment. The Resource Manager approves them, and approved days supply the leave figures on invoice lines.

| Field | Value |
|---|---|
| Module code | TSH |
| Module version | v1.0 |
| Doc revision | Rev 1.0 |
| Status | `Built` — on branch `feat/m65-timesheets`, not yet released |
| Plan module | M65 |
| Appears as | My Timesheet · Timesheet Approvals · Holidays |
| Screens | /timesheet · /approvals · /holidays · Timesheet panel on /deployments/[id] and /projects/[id] |
| Decisions | D1 D2 D3 D9 D10 D11 (FSD-00 §6) |
| Gaps closed | G-RES-01 G-RES-02 G-RES-03 G-RES-04 G-RM-01 |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module, leave on an invoice was typed by hand per line. Timesheets make it a record: the resource enters each day, the Resource Manager approves it, and an invoice for a period with every working day approved takes its leave from those days.

Not in scope: leave balances and reminders (G-RES-05), a mobile app (G-RES-06), client sign-off attachments (G-RES-07), expense claims (G-RES-08), billing weekend or overtime work.

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

Resource and Resource Manager are no longer pending roles (FSD-01). A resource account must be linked to a resource record on the People screen; an unlinked one sees an explanation instead of a timesheet.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-TSH-001 | A resource sees its name, designation and its deployments — project, client, dates, status. No billing, commission, overhead, CTC or margin figure is in any response sent to a resource. | v1.0 | `Built` |
| FR-TSH-002 | Time is entered by week, per deployment. Each day holds rows of a type — Work, Paid leave, Unpaid leave, Holiday — with hours and a task note. | v1.0 | `Built` |
| FR-TSH-003 | **Two versions, per deployment (D10, D11).** v1 Daily allows one row a day; v2 Tasks allows several task rows that add up to the day. A deployment with no version uses its project's default; the project default is v1. | v1.0 | `Built` |
| FR-TSH-004 | Each day shows what it is worth as it is typed: days worked, paid leave, unpaid leave. | v1.0 | `Built` |
| FR-TSH-005 | Holidays from the calendar pre-fill an empty day as a Holiday row. The resource can replace it if they worked. | v1.0 | `Built` |
| FR-TSH-006 | **Lifecycle.** A day is Draft, Submitted, Approved or Rejected. The resource saves days as drafts and submits a week. Submitted and approved days cannot be edited. A rejected day shows its reason, can be corrected and submitted again. | v1.0 | `Built` |
| FR-TSH-007 | **Approval queue (G-RM-01).** Submitted days grouped by resource and by the deployment's cadence — daily, weekly or monthly. Approve or reject a day, approve a whole group, or select days across groups and approve or reject them together. A rejection requires a reason. | v1.0 | `Built` |
| FR-TSH-008 | **Holiday calendar (G-RES-03).** Admin adds holidays company-wide or for one client, and removes them. Removing a holiday does not change days already recorded. | v1.0 | `Built` |
| FR-TSH-009 | **Settings.** Admin sets, per deployment, the version, the hours in a full day (default 8) and the approval cadence (default weekly), and per project the default version. | v1.0 | `Built` |
| FR-TSH-010 | **Invoice feed (G-RES-04).** For each invoice line, the invoice form shows how many of the period's working days are approved. When all are, the line's paid and unpaid leave are filled from the timesheets and locked, and the server stores those figures whatever the form sent. Otherwise the line stays as entered and shows "11 of 22 days approved". | v1.0 | `Built` |

## 4. Business rules

- **BR-TSH-01 Hours to days (D9).** A day's work = hours worked ÷ the deployment's full-day hours, capped at 1, rounded to the nearest half day. On an 8-hour day: 8 h = 1, 6 h = 1, 4 h = 0.5, 3 h = 0.5, 1 h = 0. *Rounding to the nearest half (not down) is a default awaiting Product Owner confirmation.*
- **BR-TSH-02 Short days.** On an expected working day, any part not covered by work or paid leave counts as unpaid leave. Logging 4 of 8 hours and nothing else is half a day unpaid. *Default awaiting confirmation.*
- **BR-TSH-03 Expected days.** Monday to Friday, less holidays that apply to the deployment's client. Weekends can be recorded but never create unpaid leave.
- **BR-TSH-04 Only approved days count.** A day with any row not approved counts for nothing in the invoice feed.
- **BR-TSH-05 When timesheets override an invoice.** Only when every expected day of the line's period is approved, across every deployment of that resource on the invoice's project. *Default awaiting confirmation.* Billed days and the line amount are still computed by the existing invoice formula (FSD-12 BR-INV-01); only its leave inputs change.
- **BR-TSH-06 Paid leave is billed, unpaid leave is deducted** — unchanged from FSD-12.
- **BR-TSH-07 Holidays** are company-wide or per client. There is no location rule, because nothing in the application records a location. *Default awaiting confirmation.*
- **BR-TSH-08 Derived values are never stored or accepted.** Days worked and leave are computed from the rows whenever needed (`lib/timesheet-rules.ts`).

## 5. Data

| Table | Holds |
|---|---|
| `timesheet_entries` | deployment, date, type, hours, task, status, submitted / reviewed by and at, rejection reason |
| `holidays` | date, name, client (null = company-wide) |
| `deployments` + | `timesheet_version` (null = project default), `full_day_hours` (8), `approval_cadence` (weekly) |
| `projects` + | `timesheet_version` (v1) |
| `invoice_resources` + | `leave_from_timesheet` — the line's leave came from approved timesheets |

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

Mock data: `npm run db:seed-timesheets` (additive, after `npm run db:migrate`).

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M65 | First build. |

## 8. Known limitations

- The four defaults marked above await Product Owner confirmation.
- A resource cannot see past approved weeks in summary form; they browse week by week.
- The invoice's pre-GST total is still editable by design (FSD-12); it follows the lines unless overridden.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 21 Oct 2026 | v1.0 | First issue, written against branch `feat/m65-timesheets`. |
