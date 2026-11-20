---
title: Resource Exit, Campaign Contact Import & Collected-Invoice Edit - Plan
type: feat
date: 2026-11-20
topic: m68-m70-exit-import-invoice-edit
artifact_contract: ce-unified-plan/v1
product_contract_source: chat scoping 20 Nov 2026
execution: code
status: approved
---

# Resource Exit, Campaign Contact Import & Collected-Invoice Edit — Plan

## Goal Capsule

- **Objective:** three features the Product Owner asked for on 20 Nov 2026 —
  record a resource's exit, load a campaign's contact list from a file, and
  correct the clerical fields of an invoice that has already been collected.
- **Means:** three independent modules, M68–M70. Each lands on its own branch
  off `main` and is merged forward, as M65–M67 were.
- **Product authority:** the Product Owner (Techstalwarts).
- **Status:** D17–D29 approved as recommended on 20 Nov 2026.
- **Stop conditions:**
  - Stop and ask before any `npm run db:*`. Those target the shared Turso
    database, which may be production — see `docs/HANDOVER.md`.
  - Run the migration **before** deploying the code that needs it.
- **Who finishes:** this plan's units, then the FSD updates in U13.

---

## Product Contract

### Summary

| Module | Covers | FSD |
|---|---|---|
| **M68** Resource exit | Mark a resource as having left, with date and notes. Exited resources leave the pickers and the roster counts but stay in all history | FSD-02 |
| **M69** Campaign contact import | Upload a contact list against a campaign, map its columns, preview, then commit into prospects and contacts | FSD-14 |
| **M70** Collected-invoice edit | A collected invoice's number, dates and notes become editable. The money does not | FSD-12 |

### Actors

- **Admin / Resource Manager** records an exit (M68).
- **Leadgen** imports a campaign's list (M69).
- **Accounts / Admin** corrects a collected invoice (M70).
- **Management** sees all three and writes none of them.

### Decisions (D17–D29) — approved 20 Nov 2026

| # | Decision |
|---|---|
| D17 | An exit is **refused** while a deployment runs past the exit date. The error lists them, and the same action can end them at the exit date when the operator ticks it. |
| D18 | Exited resources leave the pickers for new work and the roster counts; they stay in all history. The Resources list gains an Active / Exited / All filter, defaulting to Active. |
| D19 | Recording an exit sets the linked account's `access_until` to the exit date, so a leaver can still file their last timesheet. It does not delete the account. |
| D20 | An exit can be undone by clearing it. |
| D21 | **CSV only** in v1. No xlsx parser is added. |
| D22 | **Column mapping UI**, auto-matched on header names, remembered per campaign. Settled by the three reference sheets: three header vocabularies, one with a different column order. |
| D23 | A row creates a prospect (the company) and a contact (the person). Company name is required. |
| D24 | Each run writes a `campaign_imports` row: file, who, when, and the counts. |
| D25 | `collected_date` is editable on a collected invoice. |
| D26 | Edits to a collected invoice are logged field by field in `invoice_edits`. |
| D27 | Who may edit is unchanged — whoever can write invoices today. No new access rule. |
| D28 | An import carries **defaults** — industry, source, owner, fallback location — applied to every row. |
| D29 | Re-importing creates what is new and leaves what exists, naming every skip in the preview. An "update existing" tick mirrors the CLI importer's `--update`. |

### What the reference sheets established

Three sheets were supplied: `Real Estate Data.xlsx` (187 rows, 143 companies),
`Seamless Companies.xlsx` (92 rows, 88 companies), `Sofiya UAE.xlsx` (20 rows,
13 companies). They are the reason several rules below exist at all.

| Observation | Rule it forces |
|---|---|
| 299 rows → 244 companies; Prestige Group appears 6 times | A row is a **contact**. Rows group by normalised company into one prospect. |
| 79 email cells and 44 phone cells read `NA` | `NA`, `N/A` and `-` are null sentinels, stored as empty. |
| 60 email cells hold two addresses | First address becomes the contact's; the raw cell is kept verbatim. |
| `Remarks` exists, and the raw email cell needs a home | `prospect_contacts.notes` is added. |
| The Real Estate file carries 918 XML rows for 187 real ones | Blank rows are skipped silently, not reported as errors. |
| "Sofiya UAE" contains Riyadh and Saudi rows | Location is per-row where the column exists; the sheet name is not evidence. |
| `Assigned to` and `Remarks` are mapped but empty in all 20 rows | Map them anyway — they are intended columns with nothing in them yet. |

### Scope boundaries

- **Not** an xlsx parser (D21). Excel's Save As → CSV is the path in.
- **Not** a rewrite of the CLI importers. The in-app importer is new code that
  shares `lib/validations.ts`, not a port of `scripts/import/`.
- **Not** an unlock of invoice money. Amount, GST, currency, FX rate, period,
  project, agreement, scope and the resource lines stay locked once collected,
  and `DELETE` stays refused.
- **Not** a new access role. M70 rides on existing invoice write access (D27).

---

## Planning Contract

### Key technical decisions

- **Exit is a date, not a status enum.** `exit_date IS NULL` means active.
  One nullable column cannot drift out of step with a second status field.
- **The exit rules are a pure module.** `lib/resource-exit-rules.ts` decides
  what blocks an exit; the route applies it. The invoice and timesheet routes
  have no behavioural tests today, so new rules ship as pure functions with
  tests rather than as logic buried in a handler.
- **The importer builds `prospectSchema` payloads.** `prospectSchema` already
  accepts `campaignId`, `source`, `industry`, `location`, `notes` and a
  `contacts` array, so an imported row is one the Add Prospect form would have
  accepted. Its 20-contact cap means contacts for an *existing* prospect go
  through the contacts path instead of the create path.
- **Duplicate matching is not reimplemented.** The importer calls
  `normaliseCompanyName` and `findDuplicates`, so an import cannot create what
  the UI would have flagged.
- **M70 branches inside the existing `PUT`** rather than adding a route. A new
  route would need its own entry in the access policy and the chokepoint scan;
  a branch needs neither.

### System-wide impact

- **21 read sites on `resources`** across 17 files are audited for D18. Those
  that mean "the current roster" gain an `exit_date IS NULL` filter; those that
  mean "who this invoice covered" do not.
- **Three additive migrations**: `resources.exit_date`, `exit_notes`,
  `exit_recorded_by_user_id`; `prospect_contacts.notes`; and the two new
  tables `campaign_imports` and `invoice_edits`. All in `lib/ddl.ts`.
- **No column is dropped or renamed.** Rollback runs the previous image
  against the newer schema, so old code must still work.

### Risks

| # | Risk | Handling |
|---|---|---|
| R1 | An exit silently changes what gets billed next month | D17 refuses rather than auto-ends; ending deployments is an explicit tick, and the confirmation names each one |
| R2 | A bad import creates hundreds of junk prospects | Dry-run preview is the default and commits nothing; the preview names every create, update, duplicate and error |
| R3 | `NA` stored literally would poison every "has an email" filter forever | Sentinel handling is in the pure parse module, with tests |
| R4 | Opening a collected invoice weakens an audit record | Only clerical fields open; every change is logged to `invoice_edits` with before and after |
| R5 | No CI gate exists | `npm test` and `npm run build` by hand before each push |

---

## Implementation Units

### M70 — Collected-invoice edit

#### U1. Edit rules and the log table
`lib/invoice-edit-rules.ts` with `COLLECTED_EDITABLE_FIELDS` and
`invoiceEditDiff(before, after)`; `invoice_edits` table in `lib/ddl.ts` and
`lib/schema.ts`; tests.

#### U2. The restricted PUT
`collectedInvoiceSchema` in `lib/validations.ts`. `PUT /api/invoices/[id]`
branches on `status === 'collected'` instead of returning 409, writes only the
allowed fields, and records the diff. `DELETE` is untouched.

#### U3. The reduced form
`app/invoices/client.tsx` keeps Edit enabled at collected and opens a form of
the five fields, saying why the money is locked. The invoice detail view shows
the edit history.

### M68 — Resource exit

#### U4. Schema and rules
`resources.exit_date`, `exit_notes`, `exit_recorded_by_user_id` in `lib/ddl.ts`
and `lib/schema.ts`. `lib/resource-exit-rules.ts`: what blocks an exit, which
deployments would be ended, what the linked account's `access_until` becomes.
Tests.

#### U5. The exit route
`resourceExitSchema`; `POST /api/resources/[id]/exit` applying D17 and D19 in
one transaction, `DELETE` undoing it (D20).

#### U6. The 21 read sites
Each of the 21 `from(resources)` call sites is classified roster or history and
filtered accordingly (D18).

#### U7. The exit surface
Exit modal, Exited badge, and the Active / Exited / All filter on
`app/resources/client.tsx`; the exit panel on `app/resources/[id]`.

### M69 — Campaign contact import

#### U8. Contact notes and the import log
`prospect_contacts.notes`; `campaign_imports` table; schema and DDL.

#### U9. The parse module
`lib/leadgen-import.ts`: header auto-match, `NA` sentinels, multi-email split,
blank-row skipping, company grouping, duplicate matching through
`normaliseCompanyName`. Pure, and tested against the shapes of the three
reference sheets.

#### U10. Preview and commit routes
`POST /api/leadgen/campaigns/[id]/import/preview` and `.../commit`, multipart,
dry-run by default (D29).

#### U11. The import screen
Upload → map → preview → commit on `app/campaigns/[id]`, with the defaults step
(D28) and a per-row preview table.

#### U12. Import history
The campaign page lists past imports with their counts (D24).

### Closing

#### U13. FSDs and docs
FSD-02 (resources), FSD-12 (invoices) and FSD-14 (leadgen) get a version bump,
a revision row, and their shipped FS items moved to FR items. FSD-00A's gap
register is reconciled. The living plan artifact is republished from these
files.

---

## Verification Contract

- `npm test` passes, including the new tests for the three pure rule modules.
- `npm run build` passes.
- An exit is refused while a deployment runs past it, and accepted once the
  tick ends them; the linked account's `access_until` matches the exit date.
- An exited resource is absent from the deployment form's picker and from the
  roster counts, and present on the invoice that covered them.
- Importing `Real Estate Data.csv` previews 187 rows as 143 prospects, reports
  the `NA` cells as empty and the multi-email cells as split, and writes
  nothing until committed.
- Re-importing the same file a second time creates nothing and names every
  skip.
- A collected invoice accepts a new number, dates and notes, refuses a changed
  amount, and shows the change in its history.

## Definition of Done

Every unit above, including **U13**. A feature is not done when it works; it is
done when the spec says what it does.
