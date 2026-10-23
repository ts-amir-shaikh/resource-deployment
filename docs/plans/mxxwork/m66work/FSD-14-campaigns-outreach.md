# Campaigns & Outreach

`FSD-14 · CMP`

Lead Generation groups its outreach into campaigns, logs every call, email, LinkedIn touch, event and meeting against the prospect it was with, and sees what each campaign produced.

| Field | Value |
|---|---|
| Module code | CMP |
| Module version | v1.0 |
| Doc revision | Rev 1.0 |
| Status | `Built` — on branch `feat/m66-leadgen`, not yet released |
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

## 4. Business rules

- **BR-CMP-01 Results are computed, never stored** (KTD3), in `campaignResults()` in `lib/leadgen-rules.ts`.
- **BR-CMP-02 Reached** = the campaign's prospects with at least one activity. **Responded** = those with an activity whose outcome is set and is not *no answer* or *not interested*. **Meetings** = meeting activities on the campaign's prospects. **Leads** = the campaign's prospects that became a lead.
- **BR-CMP-03 Conversion** = leads ÷ reached, to one decimal place. With nobody reached it shows a dash, never 0 %. Worked example (AE5): 10 prospects, 6 reached, 3 responded, 2 meetings, 1 lead → 16.7 %.
- **BR-CMP-04** A prospect belongs to the campaign through its own campaign link; an activity's campaign tag does not move a prospect into a campaign.

## 5. Data

| Table | Holds |
|---|---|
| `campaigns` | name, segment, channel, start and end dates, status, owner, notes, created by |
| `activities` | prospect, lead, campaign, contact, type, date, outcome, notes, next follow-up, attendees, next step, by user |

New tables only; nothing existing changes.

## 6. Interfaces

| Route | Who | Does |
|---|---|---|
| `GET/POST /api/leadgen/campaigns` | Read: Lead Gen, Sales, Admin, Management. Write: Lead Gen, Admin | List with results; create |
| `GET/PUT /api/leadgen/campaigns/[id]` | as above; edit per §2 | One campaign with results and prospects; edit |
| `GET /api/leadgen/activities` | Lead Gen, Sales, Admin, Management | Follow-ups due for the viewer |
| `POST /api/leadgen/activities` | Lead Gen, Sales (on held leads), Admin | Log an activity |

Mock data: `npm run db:seed-leadgen` (additive, after `npm run db:migrate`).

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M66 | First build. |

## 8. Known limitations

- Activities cannot be edited or deleted once logged; a correction is a new note.
- There is no per-campaign date filter on results; they cover all time.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 22 Oct 2026 | v1.0 | First issue, written against branch `feat/m66-leadgen`. |
