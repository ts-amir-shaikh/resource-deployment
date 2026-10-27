---
title: M62 Accounts workspace — billing details, PO consumption, receipts, credit notes, proforma, monthly drafts
type: feat
date: 2026-10-27
branch: feat/m62-accounts-workspace
base: feat/m67-resource-review (135a819)
status: draft — awaiting Product Owner approval
---

# M62 Accounts workspace

## Goal Capsule

- **Objective:** let the Accounts role run billing end to end inside the app — raise and correct agreements and invoices, record what clients actually paid, correct an invoice after it is raised, and see PO consumption and margin — without going through Admin.
- **Covers:** G-ACC-01 to 06 and G-ACC-10 (FSD-11, FSD-12, FSD-08).
- **Out of scope:** the Tally bridge (M63, M64); invoice PDF (G-ACC-07); overdue reminders (G-ACC-08); INR revenue reporting (G-ACC-09); client logins; payroll actuals.
- **Stop conditions:** stop and ask before any `npm run db:*` other than against the shared test database; before changing the invoice pro-rating maths; before any production migration (Product Owner only).
- **Why now:** Accounts is held at `/welcome`, so every invoice and agreement change goes through Admin. Tally sync (M63/M64) needs receipts, credit notes and proformas to exist in the app first, or the bridge has nothing correct to send or reconcile.

## Delivery in three slices

Each slice is built, tested and checked in the browser before the next starts. Slice 2 does not start until the pre-work below is done and D-A1 to D-A4 are answered.

| Slice | Contents | Risk |
|---|---|---|
| **A. Role and reads** | Accounts screens and access; client billing details; PO consumption; margin and CTC for Accounts and Admin | Low — screens and additive columns |
| **B. Receipts and corrections** | Receipts (partial, TDS, short payment); void and credit notes | High — changes how money is recorded |
| **C. Proforma and monthly drafts** | Proforma as a pre-invoice state; draft the month's invoices from approved timesheets and active deployments | Medium — touches the invoice lifecycle |

## Pre-work (before slice B)

| # | Item | Why |
|---|---|---|
| P1 | Tests for the existing pro-rating and invoice rules, written first and measured against current behaviour | The invoice maths has no tests; slice B and C change the code around it (scope risk R2) |
| P2 | CI test gate on push | `main` auto-deploys and nothing runs `npm test` (R3) |
| P3 | Confirm a production database backup exists | Slices B and C write money records (R4) |

## Decisions needed from the Product Owner

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| D-A1 | Is the **app or Tally** the document of record for invoice numbers and the invoice document? | App owns the number and the record; Tally mirrors it via M64. Reserve nullable external-reference columns now | B, M64 |
| D-A2 | What happens to invoices already **Collected**? | Left exactly as they are. Receipts apply from the first invoice raised after release; a collected invoice with no receipts reads as paid in full | B |
| D-A3 | Does a **credit note** need an approval step? | No, Accounts issues it, and Admin sees the full log. Revisit when Tally postings are gated (D14) | B |
| D-A4 | Who sees **margin and CTC**? | Accounts and Admin only. Management stays view-only for what it sees today and does not gain it | A |
| D-A5 | Is PO consumption measured **before or after GST**? | Before GST (the amount that the PO value covers), per currency, never converted | A |
| D-A6 | Should Accounts also **approve or advance** invoices through the lifecycle, or only create and edit? | Both, as Admin does today, but never delete a Collected one | A |

## Slice A — role and reads

### Access (`lib/access.ts` only)

| Role | Read | Write |
|---|---|---|
| Accounts | Invoices, agreements, clients (incl. billing details), projects, deployments, margin and CTC | Invoices, agreements, client billing details. Not users, pipeline, reviews, timesheets |
| Admin | All | All |
| Management | Unchanged (view-only) | None |

Accounts is lifted out of `PENDING_ROLES` and gets a landing page (the invoice board). Every new path is asserted in `lib/accounts/roles.test.ts`, including what Accounts may **not** open. `tests/chokepoints.test.ts` must pass with no exemptions.

### Client billing details (G-ACC-02, FS-CLI-01)

New nullable columns on `clients`: `gstin`, `billing_address`, `payment_terms`, `default_due_days`. Zod: GSTIN format check, `default_due_days` a positive integer, `z.literal('')` first in unions. A new invoice's due date defaults from `default_due_days` when set; the user can still change it. Existing clients stay valid with all four empty.

### PO consumption (G-ACC-05, FS-AGR-01)

On the agreement page and list: invoiced against value, remaining, and a warning when remaining falls under a threshold. Computed on the server per currency from the agreement's invoices, excluding void and credited amounts once slice B exists. No threshold is stored per agreement in this slice; a fixed 15% is used and noted in the FSD.

### Margin and CTC (G-ACC-01)

Show margin and CTC wherever Admin sees them today, to Accounts too. Role-based hiding is enforced on the server, not just the page: every other role's API shapes keep stripping them, and the strip is built by allowlist. **U1 includes a survey of where these figures surface today**, so no screen or API leaks them to a role that does not see them now.

## Slice B — receipts and corrections

### Receipts (G-ACC-04, FS-INV-03)

New table `invoice_receipts`: invoice, received date, amount received, TDS deducted, note, recorded by. Never edited in place; a mistaken receipt is reversed by a counter-entry, so the history is a ledger.

- **Collected is derived**: an invoice is Collected when received + TDS ≥ its total. Partial collection keeps it at `Pending to Collect`. This is recomputed on the server from the receipts, never accepted from the request body.
- Outstanding and "collected" figures on the client page and dashboard read from receipts, with each currency kept separate.
- The lifecycle stays forward-only. Existing "Collected" invoices follow D-A2.

### Void and credit notes (G-ACC-03, FS-INV-02)

A void is **not** a backward status move. A raised or collected invoice is cancelled by a **credit note**: a separate linked record (`invoice_credit_notes`) for a full or partial amount with a required reason. The original invoice keeps its status and number; its net amount shows the credit, and PO consumption (slice A) subtracts it.

- A credit note cannot exceed the invoice's remaining amount, and cannot be deleted.
- The message that says a collected invoice must be "voided and re-raised" is updated to point at the credit note.

### Migrations

Additive only. New tables `invoice_receipts` and `invoice_credit_notes`, plus nullable external-reference columns on `invoices` for D-A1. Old code keeps working against the new schema.

## Slice C — proforma and monthly drafts

### Proforma (G-ACC-10, D15)

Add `proforma` as a pre-invoice status ahead of `Not Raised → Raised → …`, so the forward-only lifecycle holds. A proforma has its own number and cannot be collected against. Converting it to a tax invoice moves it forward and keeps the link.

### Monthly drafts (G-ACC-06, FS-INV-04)

"Draft this month's invoices" creates one `Not Raised` draft per project from active billable deployments at their rates, with lines already filled with approved timesheet and leave figures (M65). Drafts are listed for review before anything is raised. Billed days and amounts come from the existing pro-rating code, recomputed on the server (BR-INV-04). Running it twice for the same month creates no duplicates.

## Units

1. **U1 Survey and baseline tests** — find where margin/CTC surface today; pro-rating and lifecycle baseline tests (P1).
2. **U2 Access and tests** — lift Accounts from `PENDING_ROLES`; policy, nav, landing; `roles.test.ts`.
3. **U3 Slice A schema and server** — billing-detail columns; Zod; PO consumption queries; margin/CTC allowlisted shapes.
4. **U4 Slice A screens** — Accounts landing, client billing form, agreement PO-consumption block.
5. **U5 Rules for slice B** — `lib/invoice-rules.ts`: derived status from receipts, credit-note limits; unit tests first.
6. **U6 Slice B schema, server, screens** — receipts and credit notes; routes under `app/api/invoices`.
7. **U7 Slice C** — proforma state; monthly draft job.
8. **U8 Mock data** — `scripts/seed-accounts.ts`, additive and idempotent (billing details, partial receipts with TDS, a credit note, a proforma).
9. **U9 Docs** — FSD-08 (v1.5), FSD-11 (v1.6), FSD-12 (v2.4), FSD-01 role access, FSD-00A (move G-ACC-01 to 06 and 10), FSD index, CLAUDE.md test counts.

## Verification

- `npx tsc --noEmit` clean; `npm test` green including the chokepoint scan and the new baseline tests.
- Slice B: receipts and credit notes are asserted at the rules level, plus the invoice routes hand-verified against the shared test database, because those routes have no route tests.
- Manual walk-through in the browser as Accounts, Admin, Management, Sales and Resource Manager; confirm Accounts cannot reach pipeline, reviews or timesheets, and that margin and CTC are absent from every other role's responses.
- `npm run build` is run by the user. Production migration and deploy are the Product Owner's.

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Receipts change what "Collected" means for existing invoices | D-A2; collected invoices with no receipts read as paid in full; no data rewritten |
| R2 | Untested invoice maths is changed by slices B and C | P1 baseline tests first |
| R3 | Margin or CTC leaks to a role that must not see it | Allowlisted shapes, server-side stripping, U1 survey, role tests |
| R4 | Tally design later contradicts the model | D-A1 settled first; nullable external-reference columns reserved |
| R5 | Slices bundled into one release under time pressure | Slices are separate and each is approved and checked before the next |
