# Leave

`FSD-21 · LVE`

Resources apply for leave, the Resource Manager approves it, and approved leave appears on the timesheet and takes the paid and unpaid leave days off the invoice. Leave is no longer typed into the timesheet.

| Field | Value |
|---|---|
| Module code | LVE |
| Module version | v1.0 |
| Doc revision | Rev 1.0 |
| Status | `Built` — on branch `feat/m65-timesheets`, not yet released |
| Plan module | M65 (addendum) |
| Appears as | My Leaves · Approvals → Leave tab |
| Screens | /leaves · /approvals (Leave tab) · leave marks on /timesheet |
| Decisions | D22 (FSD-00 §6) |
| Gaps closed | G-RES-10 |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module, leave was a row type in the timesheet: the resource typed "Paid leave" or "Unpaid leave" against a day. Leave is a different thing from time worked. It is asked for in advance, approved by someone else, and it prices an invoice. So it has its own request, its own approval and its own screen, and the timesheet records work only.

Not in scope: leave balances, allowances and carry-forward (G-RES-05); reminders; cancelling leave that is already approved; leave for candidates or other roles.

## 2. Users and access

| Action | Admin | Management | Resource Mgr | Resource | TA / Lead Gen / Sales |
|---|---|---|---|---|---|
| Apply for and withdraw own leave | — | — | — | Yes | — |
| See own leave | — | — | — | Yes | — |
| See the leave queue | Yes | Yes | Yes | — | — |
| Approve, reject, change paid/unpaid | Yes | — | Yes | — | — |

A resource reaches only the requests of the resource record its account is linked to. Rules are in `lib/access.ts`; row scoping in `lib/leaves.ts`. No response carries money.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-LVE-001 | **Apply.** A resource asks for a date range, paid or unpaid, optionally a half day (one day only), with an optional reason. The form says how many working days the request takes before it is sent. | v1.0 | `Built` |
| FR-LVE-002 | **My Leaves.** A list of own requests with dates, days, type, status and reason (or the rejection reason), the paid and unpaid days approved this year, and how many requests wait. A pending request can be withdrawn. | v1.0 | `Built` |
| FR-LVE-003 | **Leave approvals.** A Leave tab on the Approvals screen lists pending requests with the resource, the clients they are deployed at, dates, days and reason, and the last decisions. The approver approves, or rejects with a reason the resource sees. | v1.0 | `Built` |
| FR-LVE-004 | **Paid or unpaid is the approver's call.** The resource proposes; the approver may change it when approving, because whether a day is paid depends on what the client's agreement allows. | v1.0 | `Built` |
| FR-LVE-005 | **On the timesheet.** Approved leave days show as leave and reduce what is expected that day (half a day halves it). A pending request is marked "Leave requested". Neither is entered on the timesheet. | v1.0 | `Built` |
| FR-LVE-006 | **On the invoice.** Approved leave is what fills a line's paid and unpaid leave, by the same rule as approved timesheet days (FSD-18 BR-TSH-05, FSD-12). A pending, rejected or withdrawn request has no effect. | v1.0 | `Built` |
| FR-LVE-007 | **On the dashboard.** Approved leave counts as leave hours in the timesheet dashboard (FSD-18). | v1.0 | `Built` |

## 4. Business rules

- **BR-LVE-01 Days are counted, never stored.** A request's days are the working days in its range, less weekends and holidays that apply to the resource's clients, at 1 each or 0.5 for a half day. A holiday added later therefore changes the count with no stale figure left behind.
- **BR-LVE-02 A half day is a single day.** A range with "half day" is refused.
- **BR-LVE-03 No overlap.** A request that overlaps the resource's own pending or approved leave is refused (409). Two requests for one day would take the day off the bill twice.
- **BR-LVE-04 Not over submitted time.** Leave cannot be requested for a day on which time is already submitted or approved (409).
- **BR-LVE-05 Needs a working day.** A request whose range is only weekends or holidays is refused.
- **BR-LVE-06 Status moves.** Pending → Approved, Rejected or Cancelled (withdrawn). Nothing else. Each move is checked against the status it was read with, so two approvers acting at once cannot both succeed. A rejection needs a reason. The resource withdraws only a pending request.
- **BR-LVE-07 Range.** A request spans at most 92 days.
- **BR-LVE-08 A day short of work is still unpaid leave** (FSD-18 BR-TSH-02). Half a day of approved leave with no work logged leaves the other half unpaid.
- **BR-LVE-09 Holidays for a request** are the company's plus those of every client the resource is deployed at. The invoice feed uses the invoice's own client.

## 5. Data

| Table | Holds |
|---|---|
| `leave_requests` | resource, start and end date, half day, type, reason, status, reviewed by and at, rejection reason |

One new table; nothing existing changes. Leave rows already entered in timesheets before this module keep counting and are never deleted, and the timesheet screen passes them through when a day is saved. `npm run db:seed-leaves` adds mock requests (additive, after `npm run db:migrate`).

## 6. Interfaces

| Route | Who | Does |
|---|---|---|
| `GET/POST /api/leaves/mine` | Resource | Own requests; apply |
| `DELETE /api/leaves/mine/[id]` | Resource | Withdraw a pending request |
| `GET/POST /api/leaves/approvals` | Resource Mgr, Admin (Management reads) | The queue; approve or reject one request |

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M65 | First build. |

## 8. Known limitations

- There are no balances or allowances; "paid leave this year" is a count of approved days.
- Approved leave cannot be withdrawn by the resource. Changing it needs an Admin function that does not exist yet.
- A resource on two clients with different holidays sees leave counted against the union of both calendars; the invoice uses the invoice's client only.
- A leave day on a deployment that has a draft work row for the same day is not marked approved until that row is.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 23 Oct 2026 | v1.0 | First issue, written against branch `feat/m65-timesheets`. |
