# Invoices

`FSD-12 · INV`

What each client is billed for a period, line by line per resource. Each line carries the working days, part-month dates and paid and unpaid leave behind it. The invoice then moves through a forward-only lifecycle from Not Raised to Collected.

| Field | Value |
|---|---|
| Module code | INV |
| Module version | v2.2 (built; v2.1 live) |
| Doc revision | Rev 1.3 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Invoices |
| Screens | /invoices · /invoices/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

An invoice belongs to a project and, optionally, to the agreement it bills under. It records the period, the amount before GST, GST, the currency and exchange rate, the dates, and the resource lines that make up the amount. The application records invoices. It does not yet produce the invoice document sent to the client.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View invoices | Yes | Yes | — | — | — |
| Add, edit, advance, delete | Yes | — | — | — | — |

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **List and board** | | | |
| FR-INV-001 | Invoices show as a list or as a four-column board (Not Raised, Raised, Pending to Collect, Collected), each column totalled per currency. The list shows invoice, client and project, period, total with its pre-GST and GST split, status and actions. | v1.0 | `Live` |
| FR-INV-002 | Filters: status, client (searchable), and an **overdue** toggle carrying the overdue count. Search covers invoice number, client and project. Overdue invoices are highlighted. | v1.4 | `Live` |
| FR-INV-003 | Several invoices can be selected and moved to the next status together. Any already at or past that status are skipped, and the result says which. | v1.0 | `Live` |
| **Raising an invoice** | | | |
| FR-INV-004 | An invoice records project (searchable), optional agreement or PO (limited to that project), invoice number, scope (Individual or Team), currency, exchange rate to INR, period from and to, invoice and due dates, amount before GST, GST amount, and notes. | v1.4 | `Live` |
| FR-INV-005 | Choosing an agreement sets the currency to the agreement's and offers its rate-card resources as lines, each at its rate-card amount. | v1.1 | `Live` |
| FR-INV-006 | Each resource line records the monthly rate, the **working days** in the month, **paid leave** (billed) and **unpaid leave** (deducted), and optionally a deployment date and last working date within the period. The line shows its billed days and amount as they are typed, for example "less 1 day unpaid leave · 2 days paid leave, billed". | v2.1 | `Live` |
| FR-INV-006a | **Leave from timesheets (M65).** Each line shows how many of the period's working days have approved timesheets. When all of them do, the line's paid and unpaid leave are filled from the timesheets and locked, the server stores those figures whatever the form sent, and the line is marked as timesheet-sourced. Otherwise the leave stays as entered. See FSD-18 BR-TSH-05. | v2.2 | `Built` |
| FR-INV-006b | **Timesheet coverage.** For Admin, the invoice page shows each line's coverage ("11 of 22 days approved") with a link to the dashboard's Invoices tab. Billing stays the fixed monthly amount, pro-rated by days; there is no hourly billing (D21). | v2.3 | `Built` |
| FR-INV-007 | Leaving working days blank makes the line a flat month at the full monthly rate. That is how every invoice before pro-rating was priced. | v2.0 | `Live` |
| FR-INV-008 | The amount before GST follows the sum of the lines, and stays editable. If someone overrides it, the field says it no longer follows the lines, and **Use lines** restores the sum. | v2.0 | `Live` |
| FR-INV-009 | For INR invoices the GST field suggests 18% of the amount, with a button to apply it. For AED and USD invoices GST is hidden, and it is refused if sent. | v1.2 | `Live` |
| FR-INV-010 | An AED or USD invoice needs an exchange rate to INR above zero, captured at the time. An INR invoice's rate is always 1. | v1.2 | `Live` |
| **Lifecycle** | | | |
| FR-INV-011 | Status moves forward only: **Not Raised → Raised → Pending to Collect → Collected**. An invoice can jump ahead several steps, but never back. | v1.0 | `Live` |
| FR-INV-012 | Moving to Raised or beyond fills in today's date as the invoice date if none was entered. Moving to Collected records today as the collected date. | v1.0 | `Live` |
| FR-INV-013 | A collected invoice can no longer be edited or deleted. | v1.0 | `Live` |
| **Detail page** | | | |
| FR-INV-014 | The invoice page shows the amounts, **Resources Covered** with each line's rate, working days, "Nd paid" and "Nd unpaid" leave, dates, billed days and amount, the billing period and dates, the status with its dates, and the agreement. | v2.1 | `Live` |

## 4. Business rules

### BR-INV-01 · Line amount (pro-rated)

The on-site share is measured in calendar days within the period, because the application holds no holiday calendar and the biller has already said what the month is worth in working days. Available days are rounded to the nearest half day. Billed days are floored at zero and capped at the month's working days, so leave can never produce a credit and a bad date can never bill more than a month. A resource present for the whole period with no unpaid leave is billed exactly the monthly rate.

```text
share          = days on site in period ÷ calendar days in period
available days = round to ½ (working days × share)
billed days    = min(working days, max(0, available days − unpaid leave))
line amount    = round(monthly rate × billed days ÷ working days)

flat line (no working days): line amount = monthly rate
```

### BR-INV-02 · Paid and unpaid leave

**Unpaid leave is deducted, and paid leave is billed.** Paid leave is still recorded, because salary is paid either way and that cost counts against margin, and because a monthly paid-leave allowance can only be enforced once the figure exists. This reading, that paid means the client has agreed to pay for those days, is the current default. See FS-INV-01.

### BR-INV-03 · Line validation

Working days must be between 1 and 31. Paid and unpaid leave together cannot exceed the working days. Leave cannot be recorded on a line with no working days. The line is refused, not silently billed as a full month. A last working date cannot be before the deployment date. A resource can appear only once on an invoice. Dates outside the period are clamped to it, not rejected.

### BR-INV-04 · The server computes the figures

Billed days and line amounts are recalculated on the server from what was typed. A stale or altered form cannot save a day count and an amount that disagree.

### BR-INV-05 · Overdue

An invoice is overdue when it is Raised or Pending to Collect and its due date has passed. The due date cannot be before the invoice date.

### BR-INV-06 · Currency and rate are locked in

An invoice keeps the currency and exchange rate it was raised with, even if its agreement is corrected later. Totals are always shown per currency. The stored rate exists so that a later reporting module can state revenue in rupees at the rate that applied on the day.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Invoice | invoices | Project, agreement, number, scope, currency, exchange rate, period, amount, GST, invoice, due and collected dates, status, notes. |
| Invoice line | invoice_resources | Resource, monthly rate, working days, paid leave, unpaid leave, deployment date, last working date, billed days and amount. The earlier single leave figure is kept, retired. |

Production at 27 Sep 2026: 112 line rows. Lines raised before pro-rating have no working days and read as the flat months they were. No line yet carries leave.

## 6. Interfaces

- **Agreements (FSD-11)**: currency and the rate card that seeds the lines.
- **Projects and Clients (FSD-09, FSD-08)**: invoices, outstanding and collected on their pages.
- **Resources (FSD-07)**: each line names a resource.
- **Dashboard (FSD-13)**: the invoice pipeline, overdue count and outstanding amounts.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M7  
  Invoices with the four-stage forward-only lifecycle, board view, bulk advance and overdue flag.
- **v1.1** · 7 Sep 2026 · 7a863e3 · —  
  Lines drawn from the agreement's rate card.
- **v1.2** · 7 Sep 2026 · 087f412 · M14  
  Currency per invoice, exchange rate captured when raised, and GST for INR only.
- **v1.3** · 7 Sep 2026 · 966d037 · M15  
  Invoice detail page.
- **v1.4** · 24 Sep 2026 · 686d99f · M47  
  Searchable project, agreement and client pickers.
- **v2.0** (major) · 25 Sep 2026 · ae67af9 · M57  
  Pro-rated lines: working days, part-month dates and leave, with billed days and amount stored per line. A line's amount is now calculated, not implied.
- **v2.1** · 27 Sep 2026 · 5e43f82 · M59 — **current**  
  Leave split into paid (billed) and unpaid (deducted). Leave without working days is refused. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-INV-01 | Confirm what paid leave means against a real SOW — The default bills paid leave. If contracts mean the client pays for neither, both kinds should deduct. That is a one-line change, and it should be settled before the first invoice with leave is raised. | Plan M59 | High | `Proposed` |
| FS-INV-02 | Void and credit notes — A collected invoice cannot be edited or deleted, and the message tells the user to "void and re-raise it", but there is no void action. A void status, or a credit note linked to the original, would give corrections a proper home. | This review | High | `Proposed` |
| FS-INV-03 | Record what was actually received — Collection is all or nothing. Tax deducted at source and short payments cannot be recorded, so Collected overstates cash received. | This review | Medium | `Proposed` |
| FS-INV-04 | Draft the month's invoices from active deployments — One draft per project, with lines from active billable deployments at their rates, for the biller to adjust for leave and part months. | This review | Medium | `Proposed` |
| FS-INV-05 | Produce the invoice document — A PDF with the client's billing details and GST breakdown. Needs client billing details first (FS-CLI-01). | This review | Medium | `Proposed` |
| FS-INV-06 | Revenue in rupees — A reporting view that converts AED and USD invoices at the rate stored on each one. That rate has been captured since v1.2 for this purpose. | Plan M14 | Later | `Planned` |
| FS-INV-07 | Holiday calendar — Pro-rating uses calendar days by design. A holiday calendar would allow a working-day share, at the cost of maintaining one per client. | Plan M57 | Only if needed | `Deferred` |
| FS-INV-08 | Correct the migration comment — The pro-rating migration's comment calls it "Phase 13", but the plan numbers it Phase 16. This is housekeeping in the code only. | Plan P16 | Low | `Planned` |

## 9. Known limitations

- **Collected invoices cannot be corrected.** See FS-INV-02.
- **The pre-GST amount can differ from the lines.** It is editable by design, and the form says when it has been overridden.
- **Paid-leave meaning is a default.** See BR-INV-02 and FS-INV-01.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v2.1 | First issue, written against commit `5e43f82`. |
| 1.1 | 21 Oct 2026 | v2.2 (built) | M65: FR-INV-006a — a line's paid and unpaid leave come from approved timesheets when every working day of the period is approved, and are locked on the form and enforced on save. See FSD-18 FR-TSH-010. |
| 1.2 | 23 Oct 2026 | v2.3 (built) | M65 addendum: FR-INV-006b coverage and link. See FSD-18 FR-TSH-016. |
| 1.3 | 23 Oct 2026 | v2.3 (built) | FR-INV-006a: leave now also comes from approved leave requests (FSD-21), by the same rule as approved timesheet days. |
