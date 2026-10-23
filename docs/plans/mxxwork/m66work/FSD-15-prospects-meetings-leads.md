# Prospects, Meetings & Leads

`FSD-15 · LED`

Lead Generation works companies as prospects — with contacts, a stage and a temperature — meets them, converts the qualified ones into leads and hands those to Sales, who raise requirements from them.

| Field | Value |
|---|---|
| Module code | LED |
| Module version | v1.0 |
| Doc revision | Rev 1.0 |
| Status | `Built` — on branch `feat/m66-leadgen`, not yet released |
| Plan module | M66 |
| Appears as | Prospects · Leads · the Sales queue on My Deals |
| Screens | /prospects · /prospects/[id] · /lead-records · /lead-records/[id] · panel on /sales |
| Decisions | D4 (prospect → lead → requirements), D12 (temperature separate from stage); plan Q1–Q7 accepted as proposed on 22 Oct 2026 |
| Gaps closed | G-LED-01 G-LED-04 G-LED-05 G-LED-06; part of G-SAL-02 and G-SAL-03 (Q5) |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module a prospect was a bare company name created by typing it into the requirement form (M46), and a requirement stood in for a lead. M66 **extends the same `prospects` table** (scope risk R6) into a working record, and adds the lead as its own record between prospect and requirement (D4):

```
Prospect  new → contacted → meeting set → qualified → converted | dead      temperature: cold · warm · hot
   └─ convert ─> Lead  open → with Sales → requirement raised | lost
                    └─ raise ─> Requirement(s) in the Staffing Pipeline
```

*Converted* means "became a lead". Becoming a client is unchanged: "Onboard as client" on a requirement, at any stage.

`/leads` stays **My Leads**, Leadgen's board of requirements (Q1). Lead records live at `/lead-records`, labelled "Leads" in the sidebar.

Not in scope: CSV import (G-LED-08), calendar sync (G-LED-09), stage gating of requirements on qualification (G-SAL-03 remainder).

## 2. Users and access

| Action | Admin | Management | Lead Gen member | Lead Gen head | Sales member | Sales head | TA and others |
|---|---|---|---|---|---|---|---|
| See prospects | All | All | Own | Team's and unowned | All, read-only | All, read-only | — |
| Create, edit prospects and contacts | Yes | — | Own (owns what they create) | Team's; sets the owner | — | — | — |
| Convert a qualified prospect | Yes | — | Own | Team's | — | — | — |
| See leads | All | All | Own | Team's and unowned | Once handed off: the queue and own | Once handed off: queue and team's | — |
| Edit a lead | Yes | — | Own, until handed off | Team's, until handed off | Own | Queue and team's | — |
| Hand a lead to Sales | Yes | — | Own | Team's | — | — | — |
| Assign the salesperson | Yes | — | — (may suggest) | — (may suggest) | — | Yes | — |
| Raise a requirement from a lead | Yes | — | — (Q7: direct creation stays) | — | On leads they hold | On leads they hold | — |

A row out of reach answers **404**, not 403, on page and API alike (AE6). Paths are in `lib/access.ts`; row rules in `lib/leadgen-rules.ts` (`prospectAccess`, `leadAccess`), applied by `lib/leadgen-ownership.ts`.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-LED-001 | **Prospect record (G-LED-01).** Company, stage, temperature, owner, source (inbound, referral, campaign, event, cold outreach, other), campaign, website, industry, location, notes. Created on its own, without a requirement. | v1.0 | `Built` |
| FR-LED-002 | **Contacts.** Several per prospect: name, designation, email, mobile, LinkedIn, one marked primary. Setting a primary clears the others. | v1.0 | `Built` |
| FR-LED-003 | **List and board.** Search, filters (stage, temperature, owner, campaign). The board's columns are stages; temperature is a marker on each card (D12). Cards show the primary contact, owner and next follow-up, red when due. | v1.0 | `Built` |
| FR-LED-004 | **Stage and temperature are independent (D12, AE2).** Changing one never changes the other. A dead prospect records why. `Converted` is reached only by converting. | v1.0 | `Built` |
| FR-LED-005 | **Meetings (G-LED-04).** A meeting is an activity (FSD-14 FR-CMP-003) with attendees, outcome, notes and next step. Logging one on a prospect at New or Contacted offers to move it to Meeting set, ticked by default (R4). | v1.0 | `Built` |
| FR-LED-006 | **Convert to lead (G-LED-05, D4, Q3).** Only a Qualified prospect; once. The lead takes the company, the prospect's owner as lead owner, and the need, summary, temperature and BANT ticks entered at conversion. The prospect moves to Converted in the same transaction. | v1.0 | `Built` |
| FR-LED-007 | **Lead on an existing client (Q5, part G-SAL-02).** Lead Gen or Admin may raise a lead on a client — account growth — with no prospect behind it. | v1.0 | `Built` |
| FR-LED-008 | **BANT ticks (Q5, part G-SAL-03).** Budget, authority, need, timeline on every lead, shown on the list, at handoff and in the Sales queue. They gate nothing. | v1.0 | `Built` |
| FR-LED-009 | **Handoff (Q2).** Lead Gen hands an open lead to the Sales queue, optionally suggesting a salesperson. A Sales head or Admin assigns the owner. Sending a lead back to Open returns it to Lead Gen and clears the queue position and owner. | v1.0 | `Built` |
| FR-LED-010 | **Raise requirements (R5, AE4).** From a lead with Sales, its holder (or Admin) raises one or more requirements. The requirement form opens pre-filled; the server takes the company and both owners from the lead whatever the form sends, and stores `lead_id`. The lead lists its requirements and moves to Requirement raised. | v1.0 | `Built` |
| FR-LED-011 | **Sales queue panel.** My Deals shows the unassigned queue and the leads held by the viewer (or, for a head, by the team), with temperature and BANT. | v1.0 | `Built` |
| FR-LED-012 | **Duplicate warning (G-LED-06, Q6).** On prospect create and rename, and on client create, a name matching an existing prospect or client is warned about with links; the user may go ahead. The prospect form warns while typing. | v1.0 | `Built` |
| FR-LED-013 | **Backward compatibility (KTD7, AE7).** The requirement form's company picker, typing a new company on it, `GET /api/prospects` and "Onboard as client" behave as before. A new company typed by a Lead Gen member is now owned by them so it appears in their Prospects. Requirements created directly (Q7) carry no lead. | v1.0 | `Built` |

## 4. Business rules

- **BR-LED-01 Name matching (Q6).** Lower case, `&` read as "and", punctuation removed, then trailing legal suffixes stripped repeatedly: Private Limited, Pvt Ltd, Pvt, Private, Limited, Ltd, LLP, Inc, LLC. "Nimbus FinTech Pvt Ltd" matches "Nimbus Fintech Private Limited" (AE1). A suffix word not at the end is kept ("Limited Brands").
- **BR-LED-02 Stage moves.** Any open stage to any other; not to Converted by hand; Dead needs a reason; a Converted prospect is fixed.
- **BR-LED-03 Conversion** is refused unless the stage is Qualified, and is re-checked inside the write, so two simultaneous conversions make one lead.
- **BR-LED-04 Lead status.** Open → With Sales or Lost. With Sales → Open (returned) or Lost. Requirement raised → Lost. Lost → Open (reopened). Requirement raised is set only by raising a requirement. Lost needs a reason.
- **BR-LED-05 Owners.** A Lead Gen member owns what they create and cannot reassign it. Only a Lead Gen head (within the team) or Admin changes a prospect's or campaign's owner. Only a Sales head (within the team) or Admin assigns a lead's salesperson — the same rule as requirement owners (`canSetOwner`).
- **BR-LED-06 Requirements raised from a lead** inherit its company and its lead and sales owners; the form's company is ignored.

## 5. Data

| Table | Holds |
|---|---|
| `prospects` + | `stage` (new), `temperature` (cold), `owner_user_id`, `source`, `campaign_id`, `website`, `industry`, `location`, `dead_reason`, `updated_at` |
| `prospect_contacts` | prospect, name, designation, email, mobile, LinkedIn, primary |
| `leads` | prospect or client, company label, title, summary, temperature, four BANT ticks, status, lead owner, sales owner, suggested salesperson, handed-off at, closed reason |
| `opportunities` + | `lead_id` |

All additive. The migration backfills existing prospects (KTD1): owner = the Lead Gen account that created it, and its single contact copied into `prospect_contacts`. Both are skipped for any prospect already edited under M66, so a re-run changes nothing. The old contact columns stay and are no longer written by the M66 screens.

## 6. Interfaces

| Route | Does |
|---|---|
| `GET/POST /api/leadgen/prospects` | Scoped list with filters; create (409 + `duplicates` unless `confirmDuplicate`) |
| `GET/PUT /api/leadgen/prospects/[id]` | Detail with contacts, timeline and lead; edit |
| `POST /api/leadgen/prospects/[id]/contacts`, `PUT/DELETE …/contacts/[contactId]` | Contacts |
| `POST /api/leadgen/prospects/[id]/convert` | Convert to a lead |
| `GET /api/leadgen/duplicates?name=` | Matching prospects and clients |
| `GET/POST /api/leadgen/leads` | Scoped list; lead on an existing client |
| `GET/PUT /api/leadgen/leads/[id]` | Detail; edit, return, close, reopen |
| `POST /api/leadgen/leads/[id]/handoff` | Into the Sales queue |
| `POST /api/leadgen/leads/[id]/assign` | Set the salesperson |
| `POST /api/opportunities` + `leadId` | Raise a requirement from a lead |
| `POST /api/clients?confirmDuplicate=1` | Client create with the duplicate warning |

Unchanged in shape: `GET/POST /api/prospects` (the requirement form's picker); POST gains the duplicate warning and owner rule.

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M66 | First build. |

## 8. Known limitations

- Contacts on a lead raised on an existing client are the client's SPOCs on the client record; the lead page has no contact picker.
- Renaming a prospect renames the label on its requirements and leads that are not yet a client's; a client's name is managed on the client.
- The older contact columns on `prospects` are kept for rollback safety and are not shown.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 22 Oct 2026 | v1.0 | First issue, written against branch `feat/m66-leadgen`. |
