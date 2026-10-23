---
title: M66 Leadgen Pipeline - Plan
type: feat
date: 2026-10-22
topic: m66-leadgen-pipeline
artifact_contract: ce-unified-plan/v1
product_contract_source: docs/plans/2026-10-21-scope-m62-m67-four-modules.md
execution: code
status: built — approved 22 Oct 2026 with Q1–Q7 as proposed; awaiting browser verification and review
---

# M66 Leadgen Pipeline — Plan

## Goal Capsule

- **Objective:** give Lead Generation the front of the funnel — campaigns, prospects with contacts, an activity log including meetings, a lead temperature, and a clean handoff of a qualified lead to Sales, who raise requirements from it.
- **Covers:** G-LED-01 to G-LED-07. FSD-14 (Campaigns & Outreach) and FSD-15 (Prospects, Meetings & Leads), outlined in FSD-00 §4.
- **Decisions it implements:** **D4** (a prospect is converted into a lead, which is its own record and produces requirements) and **D12** (temperature is a separate field from stage; board columns are stages, temperature is a marker on the card).
- **Hard constraint — scoping risk R6:** prospects already exist (`prospects` table, M46) and requirements already point at them (`opportunities.prospect_id`). M66 **extends that table**; it must not create a second prospect concept.
- **Why it is low risk:** no money, no integration, no change to invoice or deployment code.
- **Stop conditions:** stop and ask before any `npm run db:*`; before changing how the existing requirement form or "Onboard as client" behave; and on Q1–Q7 below.
- **Not in scope (by the scope doc and FSD-00A):** CSV import of target lists (G-LED-08), email sequences and calendar sync (G-LED-09). Q5 asks about G-SAL-02/03.

---

## What exists today (and is reused)

| Piece | Today | M66 does |
|---|---|---|
| `prospects` table | company name, one contact (name, email, mobile), notes, who added it, `converted_client_id` | Adds stage, temperature, owner, source, campaign; contacts move to their own table (the old single contact is copied in as the first contact) |
| `POST /api/prospects` | Leadgen/Sales add a bare prospect | Kept; gains the duplicate warning |
| `GET /api/prospects` | Unconverted prospects for the requirement form's company picker | **Shape kept unchanged** so the form keeps working; the new list screen uses a new route |
| `resolveCompany()` | Typing an unknown company on a requirement creates a prospect | Kept; the new prospect starts at stage `new` |
| `opportunities.prospect_id`, `lead_owner_user_id`, `sales_owner_user_id` | Requirement ↔ prospect link and owners | Adds `lead_id`; owners copied from the lead when a requirement is raised from it |
| `/leads` "My Leads" | Leadgen's board of **requirements** they own | Unchanged (see Q1) |
| "Onboard as client" | Prospect → client, moves its requirements | Unchanged; a prospect can still be onboarded at any stage |
| `lib/ownership.ts` | Row-level rules: own vs team (head) | Same pattern for prospects and leads |

## The model, in one picture

```
Campaign ──┐
           ├──> Prospect (company)  stage: new → contacted → meeting_set → qualified → converted | dead
Contacts ──┘        │  temperature: cold / warm / hot (separate field, D12)
                    │  Activities: call · email · LinkedIn · event · meeting (with outcome, next follow-up)
                    │
                    └─ convert (D4) ──> Lead  status: open → handed_off → requirement_raised | closed_lost
                                          │   owners: lead owner (Leadgen) + sales owner (Sales)
                                          │   temperature carried over, editable
                                          └─ raise ──> Requirement(s) in the Staffing Pipeline (opportunities.lead_id)
```

`converted` on a prospect means *became a lead*. Becoming a client is a different thing and stays where it is (`converted_client_id`, "Onboard as client").

---

## Open questions (need an answer before the part they block)

| # | Question | Proposed default |
|---|---|---|
| Q1 | `/leads` is already **My Leads**, a board of *requirements*. Where do the new screens live? | Keep `/leads` as it is. New: `/prospects` (list + stage board), `/prospects/[id]`, `/campaigns`, `/campaigns/[id]`, `/lead-records` (list) and `/lead-records/[id]`. Sidebar for Leadgen: My Leads · Prospects · Campaigns · Leads. |
| Q2 | **Handoff:** does Leadgen pick the salesperson, or does the lead go to a Sales queue? | Leadgen hands off to the Sales **queue**; a Sales head (or Admin) assigns the owner — the same rule that already governs sales owners on requirements (`canSetOwner`). Leadgen may *suggest* a salesperson. |
| Q3 | **When may a prospect be converted to a lead?** | Only at stage `qualified`. Converting moves the prospect to `converted`; it cannot be converted twice. |
| Q4 | **Who sees which prospects?** | Leadgen member: own prospects; Leadgen head: team's plus unowned; Sales: all prospects read-only, and leads handed to them; Admin all; Management read-only. TA: none. |
| Q5 | FSD-15's outline also mentions **leads raised from existing clients** (G-SAL-02) and a **qualification checklist** (G-SAL-03). Those are registered as *Sales* gaps, not G-LED. In M66? | In M66 only as far as the lead record needs them: a lead may be raised **on an existing client** (account growth), and the lead carries **BANT ticks** (budget, authority, need, timeline) shown at handoff. No stage gating on the requirement — that stays G-SAL-03. |
| Q6 | **Duplicate check** (G-LED-06): warn or block? | Warn, then allow "create anyway". Match ignores case, punctuation and suffixes (Pvt Ltd, Private Limited, Ltd, LLP, Inc, LLC). Checked against prospects **and** clients, on both the prospect and client create forms. |
| Q7 | Should Leadgen still be able to create a **requirement directly** (today's behaviour), skipping the lead? | Yes — keep it, so nothing that works today breaks. The pipeline shows requirements with no lead as before. |

---

## Product contract

### Actors

- **Leadgen (A1)** — owns campaigns, prospects, contacts, activities; converts qualified prospects to leads and hands them to Sales.
- **Sales (A2)** — picks up handed-off leads, logs activity on them, raises one or more requirements from a lead.
- **Admin** — everything. **Management** — view-only (A8). **TA, Resource, Resource Manager, Accounts, Interviewer** — no access.

### Requirements

- **R1 Prospect list and page (G-LED-01).** Create a prospect on its own. Fields: company, stage, temperature, owner, source (inbound, referral, campaign, event, cold outreach, other), campaign, website, industry, location, notes, several contacts (name, designation, email, mobile, LinkedIn, primary flag). List with search, filters (stage, temperature, owner, campaign) and a stage board whose columns are stages with temperature as a marker on each card (D12). A dead prospect records a reason.
- **R2 Activity log (G-LED-02).** On a prospect (and on a lead): type `call | email | linkedin | event | meeting | note`, date, contact, outcome (`no_answer | not_interested | interested | follow_up | meeting_booked | other`), notes, next follow-up date, optional campaign. A timeline per prospect; "follow-ups due" on the Leadgen views.
- **R3 Campaigns (G-LED-03).** Name, segment (free text: e.g. "BFSI, Mumbai, 200+ staff"), channel (`calls | email | linkedin | event | mixed`), start and end dates, status (`planned | active | closed`), owner. Prospects and activities link to it.
- **R4 Meetings (G-LED-04).** A meeting is an activity of type `meeting` with attendees, outcome and next step. Logging one on a prospect at stage `new` or `contacted` moves it to `meeting_set` (suggested, not forced).
- **R5 Prospect → lead → requirements (G-LED-05, D4, D12).** Convert a `qualified` prospect into a lead (Q3); the lead keeps the link, carries temperature, a summary of the need, BANT ticks (Q5) and the lead owner. Handoff to Sales per Q2. Sales raises one or more requirements from the lead: the requirement form opens pre-filled with the company and owners, and stores `lead_id`. The lead page lists its requirements; a lead with at least one requirement shows `requirement_raised`.
- **R6 Duplicate check (G-LED-06).** Per Q6, on prospect create/edit and on client create.
- **R7 Campaign results (G-LED-07).** Per campaign, computed, never stored: prospects reached (at least one activity), responded (an outcome other than no answer / not interested), meetings, leads, conversion % (leads ÷ reached).

### Access

| | Leadgen | Sales | Admin | Management | Others |
|---|---|---|---|---|---|
| Prospects, contacts | own / team (head) — create, edit | all — read | all | read | — |
| Activities | on own prospects and leads | on leads handed to them | all | read | — |
| Campaigns | create, edit own; read all | read | all | read | — |
| Leads | create (convert), edit until handed off | handed to them — edit; head assigns owner | all | read | — |
| Raise requirement from lead | — (Q7: direct creation stays) | yes, on own leads | yes | — | — |

All through `lib/access.ts` (new prefixes and write rules); row-level own/team checks in a new `lib/leadgen-ownership.ts` beside `lib/ownership.ts`, called by routes and pages alike.

### Acceptance examples

- **AE1** Leadgen creates "Nimbus FinTech Pvt Ltd" while a client "Nimbus Fintech Private Limited" exists → warned with a link to it; can create anyway.
- **AE2** A prospect at `qualified` with temperature `cold` shows in the Qualified column with a cold marker; changing temperature never changes stage, and the reverse.
- **AE3** Converting a `qualified` prospect creates one lead linked to it, moves the prospect to `converted`; converting again is refused; converting a `contacted` prospect is refused (Q3).
- **AE4** A handed-off lead appears in the Sales queue; a Sales head assigns it; the salesperson raises two requirements from it; both carry `lead_id`, the company and the lead owner; the lead shows both and status `requirement_raised`.
- **AE5** A campaign with 10 prospects, 6 with an activity, 3 interested, 2 meetings, 1 lead shows reached 6, responded 3, meetings 2, leads 1, conversion 16.7%.
- **AE6** A Leadgen member cannot open or edit another member's prospect (404); a head can; TA gets 403 on every new route; Management can read and change nothing.
- **AE7** The requirement form's company picker, typing a new company, and "Onboard as client" behave exactly as before.

---

## Planning contract

### Key technical decisions

- **KTD1 Reuse `prospects` (R6).** New columns are additive and defaulted; existing rows backfill to stage `new`, owner = the Leadgen user who created them (else none), and their single contact is copied into `prospect_contacts`. The old contact columns stay (never dropped) and stop being written.
- **KTD2 One activity table** for calls, emails, LinkedIn, events, notes **and meetings** — meetings are not a second concept.
- **KTD3 Campaign results are computed** on read (KTD7 of the scope doc), never stored.
- **KTD4 Access only in `lib/access.ts`**; row-level in `lib/leadgen-ownership.ts`; every page `requireCurrentAccount()`, every route `handle()`.
- **KTD5 Zod schemas in `lib/validations.ts`**, `z.literal('')` first in unions.
- **KTD6 Additive migrations only.**
- **KTD7 Backward compatible:** `GET /api/prospects` keeps its shape for the company picker; `/leads`, the requirement form and onboarding are unchanged apart from the optional lead link.

### Data (all additive)

| Change | Holds |
|---|---|
| `prospects` + `stage`, `temperature`, `owner_user_id`, `source`, `campaign_id`, `website`, `industry`, `location`, `dead_reason`, `updated_at` | R1 |
| new `prospect_contacts` | prospect, name, designation, email, mobile, LinkedIn, primary |
| new `campaigns` | name, segment, channel, start/end, status, owner |
| new `activities` | prospect, lead, campaign, contact, type, date, outcome, notes, next follow-up, attendees, next step, by user |
| new `leads` | prospect, client (Q5), title/summary, temperature, BANT ticks, status, lead owner, sales owner, handed-off at, closed reason |
| `opportunities` + `lead_id` | R5 |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Changing `prospects` breaks the requirement form or onboarding. | Keep `GET /api/prospects` shape; AE7 checked by hand and by test. |
| R2 | Leadgen sees another member's prospects. | Row-level helper + tests (AE6). |
| R3 | `db:seed` / `db:clean` fail on new foreign keys. | Add the new tables to both clear lists (as done for M65). |
| R4 | No CI gate; `main` auto-deploys. | `npm test`, type check, and the user's manual `npm run build` before push. |

---

## Implementation units

1. **U1 Schema + migration.** Columns and tables above in `lib/schema.ts`, `lib/ddl.ts`, `scripts/migrate.ts` (with the KTD1 backfill); add new tables to `scripts/seed.ts` and `scripts/clean.ts` clear lists.
2. **U2 Rules + tests — `lib/leadgen-rules.ts`.** Stage and temperature lists; name normalisation and duplicate matching; conversion guard (Q3); lead status transitions; campaign result maths (AE5). Pure, unit-tested.
3. **U3 Access + tests.** Prefixes and write rules for leadgen and sales in `lib/access.ts`; `lib/leadgen-ownership.ts` (own/team/head); `lib/accounts/roles.test.ts` cases (AE6).
4. **U4 API.** `/api/leadgen/prospects` (list, create, `[id]` read/update, `[id]/contacts`, `[id]/convert`), `/api/leadgen/activities`, `/api/leadgen/campaigns` (+ `[id]` with results), `/api/leadgen/leads` (+ `[id]`, `[id]/handoff`, `[id]/assign`), duplicate check endpoint; `POST /api/opportunities` accepts an optional `leadId`; `POST /api/clients` returns the duplicate warning. All through `handle()`.
5. **U5 Screens.** `/prospects` (list + stage board with temperature marker), `/prospects/[id]` (details, contacts, activity timeline, convert), `/campaigns`, `/campaigns/[id]` (results), `/lead-records`, `/lead-records/[id]` (BANT, handoff/assign, requirements, "Raise requirement"). Sales board gets a "Leads handed to me" panel. Built from `components/ui.tsx`.
6. **U6 Mock data.** `npm run db:seed-leadgen`, additive only (like `db:seed-timesheets`): campaigns, prospects at every stage and temperature, contacts, activities, two leads (one handed off).
7. **U7 Verify.** Type check, `npm test`, end-to-end checks per role against the test database; manual `npm run build` by the developer.
8. **U8 Docs.** Write FSD-14 and FSD-15 into this folder; update FSD-00A (G-LED rows), FSD-02 (lead link), FSD-08 (duplicate warning, prospects list), FSD-05 (Sales leads panel), FSD-01 (leadgen/sales access), FSD-00 coverage rows, FSD index, README, CLAUDE.md test count; review file for the manager.

## Verification contract

- `npm test` passes, including chokepoints; new rule and access tests.
- AE1–AE7 checked as Leadgen member, Leadgen head, Sales, Sales head, Admin, Management and TA.
- Migration run against the test database only, after approval.

## Definition of Done

Plan approved; built; tests green; AE1–AE7 verified; mock data command in place; FSD-14 and FSD-15 written in this folder and the affected FSDs updated (version bump, revision row, FS → FR); review file written; plan marked `status: shipped`.
