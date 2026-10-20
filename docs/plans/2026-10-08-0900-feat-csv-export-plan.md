---
title: CSV Export from Listing Pages - Plan
type: feat
date: 2026-10-08
topic: csv-export
artifact_contract: ce-unified-plan/v1
product_contract_source: chat scoping
execution: code
status: approved
---

# CSV Export from Listing Pages - Plan

## Goal Capsule

- **Objective:** Admin and Management can download any main list as a CSV file. They choose which fields go in it, and whether it holds every row matching the current filters or only the rows they ticked. Every export is recorded: who, which list, which fields, how many rows.
- **Means:** one export route per list, behind the existing sign-in gate and account check (KTD1). Shared filter and column definitions, so the file always matches the screen (KTD2, KTD3). A new export log (KTD5).
- **Product authority:** the Product Owner (Techstalwarts). Scoping answers given 8 Oct 2026 are recorded under Key Decisions.
- **Execution profile:** code, Standard. Touches access control (who may export) and adds one table, so it needs a migration.
- **Stop conditions:**
  - Stop and ask if a list's on-screen filter cannot be reproduced on the server without changing what the screen shows.
  - Stop and ask before touching the production database. `npm run db:*` targets production Turso and runs only on the Product Owner's explicit instruction.
- **Who finishes:** the implementing agent builds and verifies on a scratch database copy. The Product Owner authorises the production migration, then the deploy, in that order.

---

## Product Contract

### Summary

Each listing page gets an **Export** button next to its page header, shown to Admin and Management only.
It opens a dialog listing the page's fields as checkboxes, with the visible table columns ticked by default.
The person chooses **All matching rows (N)**, meaning every row the current search and filters show across all pages, or **Ticked rows (M)**.
They then download `<list>-YYYY-MM-DD.csv`.

### Actors

- A1. **Admin.** Exports any list and reads the export log.
- A2. **Management.** Exports any list and reads the export log. Export is a read, so it does not break Management's view-only rule.
- A3. **TA, Lead Generation, Sales, and the pending roles.** Cannot export. They see no button, and the export routes answer 403.

### Key Decisions

- **Only Admin and Management export.** A bulk download is the easiest way for data to leave the company, so it stays with the back office. (user-directed, 8 Oct 2026.) Governs R1, R2.
- **Lists in scope:** Resources, Clients, Projects, Deployments, Agreements & POs, Invoices, Candidates (pool and Applicants queue), Staffing Pipeline, People. (user-directed.) Governs R3.
- **Rows come from the filters or from ticked rows.** Every list gets a tick column. (user-directed.) Governs R5, R6.
- **Every export is logged.** (user-directed.) Governs R9, R10.

### Requirements

- R1. The Export button appears only for Admin and Management. The access table (`lib/access.ts`) decides this, so the button and the route cannot disagree.
- R2. Every export route requires a signed-in, current account. It goes through middleware and then `handle()`. Any other role gets 403. A stale or ended session gets the usual 401 "reload" or "signed out" answer.
- R3. Export is available on the nine lists named above.
- R4. The field picker shows only the fields defined for that list. The server rejects any other field name with a 422 error. Secrets are never offered: password hashes, password-link tokens, session data and share tokens.
- R5. **All matching rows** exports exactly the rows the screen's current search and filters show, on every page, not just the 25 rows currently displayed.
- R6. **Ticked rows** exports exactly the ticked rows, which may span several pages. Ticks stay set while the person pages through the list. Invoices keeps its existing tick-and-bulk-advance behaviour on the same ticks.
- R7. File format: UTF-8 with a byte-order mark, so Excel shows ₹ and non-English names correctly. Comma-separated, with quoting per RFC 4180. One header row of field labels. Dates as `YYYY-MM-DD`. Amounts as plain numbers, with currency in its own column. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so that a spreadsheet will not run them as a formula.
- R8. The person's field choice for each list is remembered in their browser for next time.
- R9. Each export writes one log entry: who, when, which list, row mode (filtered or ticked), field list, row count, and the filters applied.
- R10. Admin and Management can read the export log on the People screen, newest first.
- R11. If the export fails (session changed, no fields chosen, server error), the dialog shows the message and stays open. The browser never downloads an error page.

### Acceptance Examples

- AE1. Admin filters Resources to skill "Java" and availability "Available" (14 rows), unticks *Mobile*, and exports all matching rows. The file has 14 data rows and no Mobile column. The log shows `resources · filtered · 14 rows`.
- AE2. Management ticks 3 invoices on page 1 and 2 on page 2, then exports ticked rows. The file has those 5 rows. No invoice status changes.
- AE3. A TA user calls `/api/candidates/export` directly. They get a 403, and no log entry is written.
- AE4. A candidate whose name is `=HYPERLINK("http://x")` exports as `'=HYPERLINK(...)`, so opening the file does nothing.
- AE5. Admin's account is deactivated while their export dialog is open. Clicking Download shows "You have been signed out." and no file is downloaded.

### Scope Boundaries

- Excel (.xlsx) and PDF output are out of scope.
- Scheduled or emailed exports are out of scope.
- The role boards (My Work, My Leads, My Deals), the dashboard and detail pages get no export.

#### Deferred to Follow-Up Work

- Export for TA, Sales and Lead Generation, limited to their own row and field visibility. The loaders built here already take the viewer, so this only needs the access rule relaxed.
- When the "hidden data and access requests" area lands, it should hide masked fields in the picker too.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. The server builds the file, not the browser.** One `GET /api/<module>/export` per list. Placing it under each module's own path means the middleware's prefix table and the chokepoint test (`tests/chokepoints.test.ts`) cover it automatically. The route checks the field list against an allowlist, writes the log entry and escapes every cell, so none of that depends on code running in the browser. The method is GET because exporting changes nothing. This keeps `canWrite` untouched, so Management stays view-only. Static `export` segments take precedence over the `[id]` routes in Next.
- **KTD2. Each list's loader and filter move into `lib/lists/<module>.ts`.** The page and the export route both call `loadRows(viewer)`. The client component and the export route both call the pure `filterRows(rows, filters)`. Each `<module>.ts` file therefore has a server-only part (the loader) and a shared pure part (the filter and the columns). This sharing is what makes R5 hold: if the filter logic were duplicated, the file and the screen would drift apart. The Pipeline loader keeps `visibleOpportunityIds` and `stripClientBudget`, applied to the viewer as they are today.
- **KTD3. A column registry for each list:** `{ key, label, value(row), defaultOn }`. The same registry drives the picker's checkboxes, the server's allowlist and the CSV header row. A column that is not in the registry cannot be exported.
- **KTD4. Request shape:** `?fields=name,email,…&mode=filtered|ticked&<filter params>` or `&ids=1,2,3`. Ticked IDs are capped at 2,000 (about 12 KB of URL) and the route answers 422 above that. Ticked IDs are still intersected with the loader's rows, so a crafted ID list cannot reach a row the viewer cannot see.
- **KTD5. A new `export_events` table:** `actor_user_id, list, mode, fields (JSON), filters (JSON), row_count, created_at`. Export events are not added to `account_events`, because that table's `subject_user_id` and account-event kinds describe one account. Exports belong in their own log, and the access-requests area may later want to query both side by side. The migration is additive: a `CREATE TABLE IF NOT EXISTS` in `lib/ddl.ts`.
- **KTD6. Who may export is decided in `lib/access.ts`.** A new `canExport(role)` holds the rule. `canAccess` refuses `/api/*/export` for any other role. The pages call the same function to decide whether to render the button.
- **KTD7. The download uses `fetch` and a blob, not a link.** A plain link would make the browser save a JSON error as the file. The dialog checks the status code first, shows any error message inline (R11), and only saves the file on a 200.

### System-Wide Impact

- About ten page server components change from inline queries to `loadRows(viewer)`, with the same output. Each list client component swaps its inline `filter` for `filterRows`, and gains a tick column and the Export button.
- New: `lib/export/csv.ts`, `lib/export/respond.ts`, `lib/lists/*.ts`, `components/export-dialog.tsx`, ten `app/api/*/export/route.ts` files, `app/api/exports/route.ts` (the log), and an `export_events` table.
- The chokepoint test's route count rises by 11. No other test should change.

### Risks

- **Moving the filters could change what a screen shows.** Mitigation: a parity test for each list that runs the old inline predicate and `filterRows` over the same fixture rows. The test is deleted once the move is complete.
- **Large Candidates exports.** The candidate pool is a few thousand rows at most, so the file is built in memory. Revisit with streaming only if exports reach tens of thousands of rows.

---

## Implementation Units

### U1. CSV writer and column registry

`lib/export/csv.ts` contains `toCsv(columns, rows)`, which handles the byte-order mark, quoting, CRLF line endings, the formula guard, and date and number normalisation. It also defines the `ExportColumn<Row>` type.
**Tests:** quoting of commas, quotes and newlines; the formula guard (AE4); the byte-order mark; nulls written as empty cells.

### U2. Access rule, export log and route helper

`canExport` in `lib/access.ts` and the export rule in `canAccess`, plus the `export_events` schema and DDL. `lib/export/respond.ts` contains `exportResponse({ list, columns, rows, req, viewer })`, which validates fields and IDs, writes the log entry, and returns the CSV with `Content-Disposition: attachment` and `Cache-Control: no-store`.
**Tests:** `canExport` for every role; a TA request to `/api/*/export` returns 403 (AE3); an unknown field returns 422; more than 2,000 IDs returns 422.

### U3. Export dialog and tick column

`components/export-dialog.tsx` contains the field checkboxes (with all and none), the filtered-or-ticked choice with live counts, the remembered field choice (R8), and the fetch-and-blob download with inline errors (KTD7). It also contains a small `useTicks()` hook and a header checkbox shared by the lists.

### U4. Back-office lists

Resources, Clients, Projects, Deployments, Agreements & POs, Invoices. For each list: the `lib/lists` module (loader, filter, columns), the page and client rewired, the tick column, the button, and the export route. Invoices reuses its existing selection.
**Tests:** a filter parity test for each list.

### U5. Candidates and Applicants

The candidate pool and the Applicants queue (`/api/applications/export`). The candidate's other skills export as one `; `-separated cell.

### U6. Staffing Pipeline

The loader carries the existing visibility rules. The columns are the requirement fields plus stage, owners and candidate counts.

### U7. People and the export log

The People list export (name, email, role, interviewer, status, access-until, last sign-in; never credentials). `GET /api/exports` returns the log, and an **Export log** view on the People screen shows it to Admin and Management (R10).

### U8. FSDs and docs

Update `docs/fsd/` (FSD-01 for the access rule and export log, and FSD-02, 03, 07–12 for each list's Export section), and add CSV export to the FSD-00A gap register if it is listed there. Add notes on the migration step.

---

## Verification Contract

- `npm test` passes, including the chokepoint scan picking up the 11 new routes.
- `npx tsc --noEmit` and `next build` succeed.
- On a scratch database copy, as Admin: AE1, AE2, AE4 and AE5 hold for each list, and the file opens cleanly in Excel and Google Sheets.
- As Management: export works, and there is still no other write.
- As TA, Sales and Lead Generation: there is no button, and calling the route directly returns 403 (AE3).

## Definition of Done

All nine lists export as specified. Every export is logged and visible. The FSDs are updated. The work is merged to `develop`. The production migration is run only on the Product Owner's go-ahead, before the deploy.
