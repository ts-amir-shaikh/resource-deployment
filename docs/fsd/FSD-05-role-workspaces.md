# Role Workspaces

`FSD-05 · WRK`

The personal boards each front-line role starts the day on: My Work for recruiters, My Leads for lead generation, and My Deals for sales. Each board puts what needs doing first, then what the person owns, and gives a head the same view across their team.

| Field | Value |
|---|---|
| Module code | WRK |
| Module version | v2.2 (v2.1 is live until M66 is released) |
| Doc revision | Rev 1.1 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | My Work · My Leads · My Deals |
| Screens | /my · /leads · /sales |
| Owner | Product Owner |

## 1. Purpose and scope

These boards hold no data of their own. They read the pipeline and candidate records and answer one question for one person: what is waiting on me? They are also where a head sees who on the team is carrying what.

### In scope

- The three boards, their KPIs and their pending-action lists.
- The head's whole-team view, the member selector, and the unowned or unassigned work.
- Source effectiveness, shown to the TA lead.

### Covered elsewhere

- Setting owners and assignees: FSD-02. Mapping and interview data: FSD-03.
- The back-office Dashboard for Admin and Management: FSD-13.

## 2. Users and access

| Board | Member sees | Head sees | Admin | Lands here after sign-in |
|---|---|---|---|---|
| My Work | Own board | Whole team, or any one TA | — | TA Team |
| My Leads | Own board | Whole team, or any one member | By address only | Lead Generation |
| My Deals | Own board | Whole team, or any one member | By address only | Sales |

My Work shows no money of any kind, and neither does the TA lead's view: a lead manages recruiters, not margins. My Deals shows deal value.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Common to all three** | | | |
| FR-WRK-001 | The board greets the person by first name. The subtitle says how many things are waiting, or that nothing is. | v1.0 | `Live` |
| FR-WRK-002 | Pending actions are shown as lists of up to eight items, with "+ N more" beyond that. Each item links to the requirement it concerns. | v1.0 | `Live` |
| FR-WRK-003 | A head gets a member selector: **Whole team**, or any active member. Picking a person shows that person's board exactly as they see it. An address naming someone outside the team falls back to the whole-team view. | v2.0 | `Live` |
| FR-WRK-004 | The head's whole-team view adds a **Team** list: each member's load in one line, and their pending-action count highlighted when it is above zero. | v2.0 | `Live` |
| FR-WRK-005 | Every KPI on every board has an info note. | v2.1 | `Live` |
| **My Work (TA)** | | | |
| FR-WRK-006 | KPIs: **My Requirements** (with positions), **Submitted**, **Interviewing**, **Offered**, **Joined**. BR-WRK-02 has the definitions. | v1.0 | `Live` |
| FR-WRK-007 | Pending actions: Follow-ups due, Mapped but not submitted, Interviews coming up, Stalled, Offers awaiting joining, Interviews with no feedback, and Profiles waiting for review. | v1.3 | `Live` |
| FR-WRK-008 | When applicants have arrived since the person last opened the queue, **Profiles waiting for review** moves to the top, and the subtitle names how many are new. Otherwise its hint says how many nobody has called yet. | v1.1 | `Live` |
| FR-WRK-009 | The TA lead's whole-team view shows **Source effectiveness**: for each candidate source, how many candidates there are, how many were mapped, submitted and joined, with the source producing most joins listed first. | v1.3 | `Live` |
| FR-WRK-010 | The TA lead's view lists **Unassigned** live requirements, meaning those with no TA assignee. | v2.0 | `Live` |
| **My Leads (Lead Generation)** | | | |
| FR-WRK-011 | KPIs: **Added this month**, **Requirement**, **Qualification**, **Budgeting**, **Handed on**, **Lost**. | v2.0 | `Live` |
| FR-WRK-012 | Pending actions: Follow-ups due, No next step recorded, Stalled. | v2.0 | `Live` |
| FR-WRK-013 | **My leads** lists every requirement the person is lead owner of, including those handed on to Sales, which are read-only to them. | v2.0 | `Live` |
| FR-WRK-014 | The head's view lists live requirements with **No lead owner**, so they can be assigned. | v2.0 | `Live` |
| **My Deals (Sales)** | | | |
| FR-WRK-015 | KPIs: **Mapping**, **Interview**, **Agreement**, **Won · 90d**, **Lost · 90d**, **In flight** (value). | v2.0 | `Live` |
| FR-WRK-016 | Pending actions: Follow-ups due, No next step recorded, Stalled, and Won, awaiting project conversion. | v2.0 | `Live` |
| FR-WRK-017 | **My deals** lists every requirement the person is sales owner of. The head's view lists live requirements with **No sales owner**. | v2.0 | `Live` |
| FR-WRK-018 | **My leads: follow-ups due (M66).** Under the header, the follow-ups due today or earlier on the prospects and leads the person can see (FSD-14 FR-CMP-005). | v2.2 | `Built` |
| FR-WRK-019 | **My deals: leads (M66).** Under the header, the Sales queue of handed-off leads and the leads the person holds — for a head, the team's — with temperature and BANT (FSD-15 FR-LED-011). | v2.2 | `Built` |

## 4. Business rules

### BR-WRK-01 · Whose work is on a board

**My Work**: live requirements where the person is a TA assignee, and candidate mappings they made or that sit on those requirements. **My Leads**: requirements where they are lead owner, any stage. **My Deals**: requirements where they are sales owner, any stage.

### BR-WRK-02 · My Work KPIs

**Submitted** counts candidates who reached the client or went further (Submitted, Interview, Selected, Offered, Joined). It measures how far they got, so a candidate now at Interview still counts. **Interviewing** counts those at Interview right now. **Offered** includes Joined. **Joined** counts those who have started.

### BR-WRK-03 · Recruiter pending actions

**Follow-ups due**: next-step date today or earlier. **Mapped, not submitted**: candidates still at Mapped. **Interviews coming up**: rounds with no outcome scheduled in the next three days, plus any already past. **Stalled**: candidates not joined, rejected or withdrawn whose status has not changed in 14 days. **Offers awaiting joining**: candidates at Offered, flagged overdue when the expected joining date has passed, or "no joining date recorded". **Interviews with no feedback**: candidates at Interview with an interview date but no feedback.

### BR-WRK-04 · Lead and deal pending actions

**No next step**: open requirements with neither a next step nor a date. **Stalled**: open requirements not moved in 14 days, going by stage history, or by creation date if never moved. **Handed on**: at Candidate Mapping, Interview, Agreement or Won. **Won · 90d / Lost · 90d**: moved to that stage in the last 90 days.

### BR-WRK-05 · In flight (as intended)

The note on the card says: the monthly value of open deals past qualification, each multiplied by its stage's win probability (Candidate Mapping 60%, Interview 75%, Agreement 90%). **The live calculation differs.** See section 9.

## 5. Data

None of its own. The boards read requirements, owners and assignees, stage history (FSD-02), and mappings, interview rounds and the applicant queue (FSD-03). The only thing written is the *applicants last seen* time on the user, which is stamped when the Applicants tab is opened.

## 6. Interfaces

- **Platform (FSD-01)**: decides which board a role lands on, and supplies the head flag.
- **Staffing Pipeline (FSD-02)** and **Candidates (FSD-03)**: every figure on these boards.

## 7. Version history

- **v1.0** (major) · 9 Sep 2026 · 61e0918 · M25  
  My Work: pending actions, own requirements, KPIs, and the team-lead roll-up.
- **v1.1** · 10 Sep 2026 · 7166e56 · M27  
  New applicants promoted to the top, with the "since you last looked" count.
- **v1.2** · 13 Sep 2026 · 90ab7fc · M38  
  Member selector for the team lead.
- **v1.3** · 15 Sep 2026 · 9e78493 · M30  
  Interviews coming up, Stalled, Offers awaiting joining, and Source effectiveness.
- **v2.0** (major) · 17 Sep 2026 · 3baa593 · M42–M45  
  My Work scoped by TA assignment instead of a single owner. My Leads and My Deals boards with heads.
- **v2.1** · 24 Sep 2026 · b77ca63 · M55 — **current**  
  Info notes on every KPI. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-WRK-01 | Make *In flight* match its definition — Apply the stage weights and count only Candidate Mapping, Interview and Agreement, as the card's note says. The alternative is to change the note and drop the "stage-weighted" label to describe what is computed. | This review | High | `Proposed` |
| FS-WRK-02 | Drop converted deals from *Won, awaiting project conversion* — The list shows every Won deal, including those already converted to a project. | This review | Medium | `Proposed` |
| FS-WRK-03 | Correct the Unassigned hint on My Work — It tells the lead to "re-run the attribution backfill". That script was removed in Phase 12. The fix is to assign a TA from the requirement page. | This review | Low | `Proposed` |
| FS-WRK-04 | Conversion rates per person — Leads handed on as a share of leads added, deals won as a share of deals owned, over a chosen period. | This review | Medium | `Proposed` |
| FS-WRK-05 | Sidebar links to My Leads and My Deals for Admin — Admin can open both boards but only by typing the address. | This review | Low | `Proposed` |
| FS-WRK-06 | Daily digest email — In-app only was chosen in Phase 9. Needs an email provider (FS-PLT-09). | Plan P9 | Later | `Deferred` |
| FS-WRK-07 | Named sub-teams — Heads oversee everyone in their role. See FS-PLT-10. | Plan P10 | Only if needed | `Deferred` |

## 9. Known limitations

> **In flight overstates the sales pipeline.** The card is labelled "stage-weighted" and its note describes weights for three stages. The calculation applies no weights, and counts every open deal from Budgeting onwards, which includes Budgeting and On Hold. The figure shown is therefore larger than the note describes. FS-WRK-01 would reconcile them.

- **Won, awaiting project conversion also lists converted deals.** See FS-WRK-02.
- **"Interviews with no feedback" reads the latest round.** It checks the interview date and feedback that the mapping mirrors from the most recent round (FSD-03).
- **Unassigned depends on assignment.** A live requirement with no TA assignee appears here even when it has a lead or sales owner.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v2.1 | First issue, written against commit `5e43f82`. |
| 1.1 | 22 Oct 2026 | v2.2 (built) | M66: FR-WRK-018 follow-ups on My Leads, FR-WRK-019 lead panel on My Deals. |
