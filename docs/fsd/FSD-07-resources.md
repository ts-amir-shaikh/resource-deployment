# Resources

`FSD-07 · RES`

The people Techstalwarts deploys to clients: their profile, skills, salary, and how much of their time is already committed. The allocation figure kept here is what stops anyone being booked past 100%.

| Field | Value |
|---|---|
| Module code | RES |
| Module version | v1.5 |
| Doc revision | Rev 1.2 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Resources |
| Screens | /resources · /resources/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

A resource is an employee or consultant who can be deployed. This module holds who they are and what they cost. Where they are deployed is recorded in Deployments (FSD-10) and summed here as utilisation.

**Access:** Admin has full use. Management can view. No other role can open this area. TA can read resources only through the bench-link picker on a candidate, which is a narrower read.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View resources | Yes | Yes | — | — | — |
| Add, edit, delete resources | Yes | — | — | — | — |

TA can read a narrow list of resources through the bench-link picker on a candidate (FSD-03). No other role sees CTC.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-RES-001 | The list shows each resource with primary skill, CTC and a utilisation bar. Resources with no allocation are marked *Available*. The list shows 20 rows to a page. | v1.1 | `Live` |
| FR-RES-002 | Search matches name, email, designation and primary skill. An availability filter offers **All, Available** (0%), **Partial** (1–99%) and **Full** (100%). Primary-skill chips narrow the list further. | v1.1 | `Live` |
| FR-RES-003 | A resource records: name, email (required and unique), mobile, designation, current CTC per year, revised CTC per year with its effective date, primary and secondary skill, and other skills as tags. | v1.0 | `Live` |
| FR-RES-004 | A revised CTC cannot be saved without its effective-from date. | v1.0 | `Live` |
| FR-RES-005 | The resource page shows the profile, every engagement (deployment history), current utilisation, compensation with monthly figures beside annual, and monthly billing from active billable deployments. | v1.3 | `Live` |
| FR-RES-006 | A resource cannot be deleted if it has an active deployment, any deployment history, or a linked candidate profile. The message says which. | v1.0 | `Live` |
| FR-RES-007 | Resources can be bulk-loaded from CSV by an operator. The import checks every row first and writes only when told to. | v1.1 | `Live` |
| FR-RES-008 | Converting a won requirement can create a resource for an external hire (FSD-02, BR-PIP-07). | v1.0 | `Live` |
| FR-RES-009 | **Timesheet section.** For Admin, the resource page shows this month's utilisation and hours from approved timesheets, with a link to the dashboard filtered to the person (FSD-18). | v1.4 | `Built` |
| FR-RES-010 | **Exit.** A resource can be marked as having left, with the last working day and notes. The record keeps who entered it. Clearing the exit puts them back on the roster. | v1.5 | `Built` |
| FR-RES-011 | The list filters on **Active / Exited / All**, defaulting to Active, and shows an *Exited* or *Leaving* badge with the date. The headline count is the roster. | v1.5 | `Built` |
| FR-RES-012 | An exit is refused while a deployment runs past the last working day. The refusal names them and offers to end them on that date in the same action (BR-RES-04). | v1.5 | `Built` |
| FR-RES-013 | Recording an exit limits the linked account's access to the last working day, so the final timesheet can still be filed. The account is not deleted. | v1.5 | `Built` |

## 4. Business rules

### BR-RES-01 · CTC is always rupees

Salary is payroll and stays in INR, even when the resource bills a client in AED or USD.

### BR-RES-02 · CTC in force

The revised CTC applies once its effective date has passed. Before that, the current CTC applies. Margin (FSD-10) uses the CTC in force.

### BR-RES-03 · Utilisation

Utilisation is the sum of allocation percentages across the resource's active deployments, billable and shadow alike. It can never exceed 100%, which FSD-10 enforces.

### BR-RES-04 · An exit never ends a deployment quietly

A deployment running past the last working day would go on feeding invoice lines for somebody who has gone. The exit is refused until the operator either closes those deployments themselves or ticks the box that ends them on the exit date — nothing is ended that they have not been shown. A deployment that starts *after* the exit is refused outright rather than ended before it began. Invoices already raised are untouched.

### BR-RES-05 · An exit removes someone from new work, not from history

An exited resource leaves the roster count, the utilisation board, the deployment picker, the skill matrix and the in-house candidate's bench link, and the deployment route refuses an exited id whatever the picker shows. They stay on every record they are already part of: past deployments, raised invoices, the agreement rate cards they are registered on, the timesheet dashboard, and the review tracker — which works from the deployments in a period, so a leaver's last month is still due. The invoice and agreement pickers still offer them, because a final month still has to be billed.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Resource | resources | Fields in FR-RES-003 and the date created. The exit is three nullable columns — date, notes and who recorded it — not a status: `exit_date IS NULL` means on the roster, and a second field would eventually disagree with the date. |

## 6. Interfaces

- **Deployments (FSD-10)**: supplies utilisation and billing. The CTC in force feeds margin.
- **Candidates (FSD-03)**: in-house candidates link to a resource.
- **Agreements (FSD-11)** and **Invoices (FSD-12)**: rate cards and invoice lines name resources.
- **Dashboard (FSD-13)**: headcount, utilisation distribution and skill mix.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M1  
  Resource records, the utilisation view, and delete guards.
- **v1.1** · 7 Sep 2026 · 1311d30 · 67df20d · —  
  CSV import, search, availability and skill filters, and paging.
- **v1.2** · 7 Sep 2026 · 966d037 · M15  
  Resource detail page.
- **v1.3** · 15 Sep 2026 · 9e78493 · M39  
  Monthly CTC beside annual. The CTC in force feeds margin.
- **v1.4** · 23 Oct 2026 · M65  
  Timesheet section on the resource page.
- **v1.5** (minor) · 20 Nov 2026 · M68 — **current**  
  Exit with date and notes, the roster filter, the deployment guard and the account access limit. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-RES-02 | Bench ageing — For available resources, the days since their last deployment ended, so long bench time is visible. | This review | Medium | `Proposed` |
| FS-RES-03 | A shared skills list — Skills are free text, so one skill spelled two ways produces two filter chips and two dashboard bars. | This review | Medium | `Proposed` |
| FS-RES-04 | CTC history — Only the current CTC and one pending revision are kept. Older figures are overwritten. | This review | Low | `Proposed` |
| FS-RES-05 | A leave register per resource — Paid and unpaid leave is typed onto each invoice line (FSD-12). A register would supply it and keep it consistent across invoices. | This review | Later | `Proposed` |

## 9. Known limitations

- **An undone exit does not reopen the deployments it ended.** By the time anyone notices, the end dates may have been adjusted by hand, so they are left to be re-dated deliberately rather than guessed at.
- **A resource created by conversion may have a placeholder email.** A joined candidate with no email becomes a resource with a generated `@placeholder.local` address, which should be corrected by hand.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v1.3 | First issue, written against commit `5e43f82`. |
| 1.1 | 23 Oct 2026 | v1.4 (built) | M65 addendum: FR-RES-009 timesheet section and link. |
| 1.2 | 20 Nov 2026 | v1.5 (built) | M68: FR-RES-010 to 013, BR-RES-04 and 05. FS-RES-01 shipped and removed. |
