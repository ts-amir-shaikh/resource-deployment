# Campaigns & Outreach

`FSD-14 · CMP`

Lead Generation groups its outreach into campaigns, logs every call, email, LinkedIn touch, event and meeting against the prospect it was with, and sees what each campaign produced.

| Field | Value |
|---|---|
| Module code | CMP |
| Module version | v1.1 |
| Doc revision | Rev 1.1 |
| Status | `Live` |
| Plan module | M66 |
| Appears as | Campaigns · the Activity panel on a prospect and a lead · Follow-ups due on My Leads and Prospects |
| Screens | /campaigns · /campaigns/[id] · activity log on /prospects/[id] and /lead-records/[id] |
| Decisions | KTD2 (one activity table, meetings included), KTD3 (results computed on read) |
| Gaps closed | G-LED-02 G-LED-03 G-LED-07 |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module, nothing recorded outreach: the first trace of a company was a requirement. Campaigns give outreach a name, a target segment and dates; the activity log records each touch with its outcome and the next follow-up; campaign results show what it produced.

Meetings (G-LED-04) are activities of type *meeting* and are specified in FSD-15, where they belong to the prospect and lead story.

Not in scope: importing target lists from CSV (G-LED-08), email sequences and calendar sync (G-LED-09).

## 2. Users and access

| Action | Admin | Management | Lead Gen | Sales | TA and others |
|---|---|---|---|---|---|
| See campaigns and their results | Yes | Yes | Yes, all | Yes, all | — |
| Create a campaign | Yes | — | Yes (owns it) | — | — |
| Edit a campaign | Yes | — | Owner; a head for the team's | — | — |
| Log activity on a prospect | Yes | — | On prospects they may edit (FSD-15 §2) | — | — |
| Log activity on a lead | Yes | — | On their own leads, also after handoff | On leads they hold | — |

Access is enforced in `lib/access.ts` (paths) and `lib/leadgen-rules.ts` (rows).

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-CMP-001 | **Campaign record (G-LED-03).** Name, segment (free text, e.g. "BFSI, Mumbai, 200+ staff"), channel (calls, email, LinkedIn, event, mixed), start and end dates, status (planned, active, closed), owner and notes. The end date cannot be before the start. | v1.0 | `Built` |
| FR-CMP-002 | A prospect may be linked to one campaign. Its activities may also name a campaign; it defaults to the prospect's. | v1.0 | `Built` |
| FR-CMP-003 | **Activity log (G-LED-02).** Type (call, email, LinkedIn, event, meeting, note), date, contact, outcome (no answer, not interested, interested, follow up, meeting booked, other), notes, next step and follow-up date. The follow-up cannot be before the activity. | v1.0 | `Built` |
| FR-CMP-004 | A prospect and a lead each show their timeline, newest first. An activity logged on a lead is filed against its prospect too, so the prospect's timeline stays whole. | v1.0 | `Built` |
| FR-CMP-005 | **Follow-ups due.** My Leads and Prospects list the follow-ups due today or earlier on what the viewer can see. Only the latest activity of a prospect (or of a lead, once there is one) counts: logging the follow-up clears the earlier promise. Converted and dead prospects and lost leads drop off. | v1.0 | `Built` |
| FR-CMP-006 | **Campaign results (G-LED-07).** Per campaign: prospects, reached, responded, meetings, leads, conversion. Shown on the list and on the campaign page. | v1.0 | `Built` |
| FR-CMP-007 | The campaign page lists the campaign's prospects that the viewer may open. The figures cover the whole campaign. | v1.0 | `Built` |
| FR-CMP-008 | **Contact import (D21–D24, D28, D29).** A CSV is uploaded against a campaign, each row being one person. Columns are matched to fields automatically and corrected by hand. Rows group by company into one prospect, tagged to the campaign. | v1.1 | `Built` |
| FR-CMP-009 | The preview states rows read, new prospects, existing matched, contacts added, skipped and failed, and lists every row that is not being added with its reason. Nothing is written until the operator commits. | v1.1 | `Built` |
| FR-CMP-010 | An import carries defaults applied to every row — industry, a fallback location, source and owner — because no supplied list carries an industry. | v1.1 | `Built` |
| FR-CMP-011 | Each run writes an import record: file name, row count, what it created, skipped and failed, who ran it and when. The campaign page lists them. | v1.1 | `Built` |

## 4. Business rules

- **BR-CMP-01 Results are computed, never stored** (KTD3), in `campaignResults()` in `lib/leadgen-rules.ts`.
- **BR-CMP-02 Reached** = the campaign's prospects with at least one activity. **Responded** = those with an activity whose outcome is set and is not *no answer* or *not interested*. **Meetings** = meeting activities on the campaign's prospects. **Leads** = the campaign's prospects that became a lead.
- **BR-CMP-03 Conversion** = leads ÷ reached, to one decimal place. With nobody reached it shows a dash, never 0 %. Worked example (AE5): 10 prospects, 6 reached, 3 responded, 2 meetings, 1 lead → 16.7 %.
- **BR-CMP-04** A prospect belongs to the campaign through its own campaign link; an activity's campaign tag does not move a prospect into a campaign.
- **BR-CMP-05 A row is a contact, not a company.** The three reference lists held 299 rows describing 244 companies. Rows group by company name, normalised by `normaliseCompanyName` — the same key the Add Prospect form warns on — so an import cannot create a company the form would have flagged. An existing prospect receives the contacts; an existing **client** is reported and left alone rather than re-created as a prospect.
- **BR-CMP-06 Empty means empty.** `NA`, `N/A`, `-`, `nil`, `none` and `TBD` as a whole cell are stored as nothing. 79 of 299 email cells and 44 phone cells read `NA`; stored literally they would answer "yes" to every has-an-email filter for good. A company genuinely called "NA Holdings" survives.
- **BR-CMP-07 Nothing is lost from a crowded cell.** Where an email cell holds several addresses — 60 of 299 did — the first becomes the contact's and the whole cell is kept in the contact's notes.
- **BR-CMP-08 Re-importing adds only what is new.** A contact already on the prospect, matched on email and otherwise on name, is skipped and named; so is the same person twice in one file. A tick overrides this, mirroring the CLI importer's `--update`. An existing prospect joins this campaign only if it is in no other.
- **BR-CMP-09** Blank rows are skipped in silence — one reference file carried 918 rows for 187 real ones. Row numbers still count the header, so they match the spreadsheet.

## 5. Data

| Table | Holds |
|---|---|
| `campaigns` | name, segment, channel, start and end dates, status, owner, notes, created by |
| `activities` | prospect, lead, campaign, contact, type, date, outcome, notes, next follow-up, attendees, next step, by user |
| `campaign_imports` | campaign, file name, row count, prospects created and matched, contacts created, rows skipped and failed, by user, when |

`prospect_contacts` gains `notes`, which holds a row's remarks and the raw email cell when it held more than one address. Everything else is new tables; nothing existing changes.

## 6. Interfaces

| Route | Who | Does |
|---|---|---|
| `GET/POST /api/leadgen/campaigns` | Read: Lead Gen, Sales, Admin, Management. Write: Lead Gen, Admin | List with results; create |
| `GET/PUT /api/leadgen/campaigns/[id]` | as above; edit per §2 | One campaign with results and prospects; edit |
| `GET /api/leadgen/activities` | Lead Gen, Sales, Admin, Management | Follow-ups due for the viewer |
| `POST /api/leadgen/activities` | Lead Gen, Sales (on held leads), Admin | Log an activity |
| `POST /api/leadgen/campaigns/[id]/import` | Lead Gen, Admin | Preview a CSV, or commit it. One route, taking `commit`, as the CLI importers take `--commit`: what is written is produced by the code that produced the preview |
| `GET /api/leadgen/campaigns/[id]/import` | Read as above | This campaign's import history |

Mock data: `npm run db:seed-leadgen` (additive, after `npm run db:migrate`).

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M66 | First build. |
| v1.1 | M69 | Contact import: upload, column mapping, preview, commit, and the import log. |

## 8. Known limitations

- Activities cannot be edited or deleted once logged; a correction is a new note.
- There is no per-campaign date filter on results; they cover all time.
- **The importer reads CSV only** (D21). No XLSX parser is added; Excel's Save As → CSV is the path in.
- **An import cannot be undone.** Prospects and contacts it created are removed one at a time, and the import record says what it added.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 22 Oct 2026 | v1.0 | First issue, written against branch `feat/m66-leadgen`. |
| 1.1 | 20 Nov 2026 | v1.1 (built) | M69: FR-CMP-008 to 011 and BR-CMP-05 to 09, the contact import. Status moved to Live — M66 shipped on 19 Nov 2026. Moved into `docs/fsd/` from `docs/plans/mxxwork/`. |
