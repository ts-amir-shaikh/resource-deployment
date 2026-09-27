# Staffing Pipeline

`FSD-02 · PIP`

Every client requirement, from the first brief to won or lost. It covers the requirement record, its stages, its owners, what it is worth, the discussion around it, the link shared with outside consultants, and the handover of a won deal to delivery.

| Field | Value |
|---|---|
| Module code | PIP |
| Module version | v4.0 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Staffing Pipeline |
| Screens | /pipeline · /pipeline/[id] · /share/[token] |
| Owner | Product Owner |

## 1. Purpose and scope

A requirement (called an *opportunity* in the data) is a client's request for one or more people with a defined skill set. The pipeline tracks each requirement through six working stages to Won or Lost, shows where headcount and money are sitting, and hands a won requirement over to delivery as a project.

### In scope

- Creating and editing requirements, including batch entry for several roles from one lead.
- The company behind a requirement, whether an existing client or a prospect.
- Stages, stage history, hold and resume, and days in the current stage.
- Owners: lead owner, sales owner and any number of TA assignees.
- Requirement value and the pipeline KPIs.
- The team and stakeholder discussion threads, and follow-up dates.
- The stakeholder share link.
- Onboarding a prospect as a client, and converting a won requirement into a project.

### Covered elsewhere

- Mapping candidates, interview rounds and ratings on a requirement: FSD-03.
- Publishing a requirement to the job board, and profiles suggested through the share link: FSD-04.
- The personal boards built from pipeline data (My Work, My Leads, My Deals): FSD-05.
- Generating interview questions from a requirement: FSD-06.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| See the pipeline | All | All | All | Own / team | All |
| See client budget | Yes | Yes | No | Yes | Yes |
| See deal value and value KPIs | Yes | Yes | No | See 9 | Yes |
| Add a requirement | Yes | — | — | Yes | Yes |
| Edit a requirement | Any | — | — | Own, to budgeting | Own |
| Move stage | Any stage | — | Any stage | Early stages | Budgeting on |
| Set owners | All three | — | Head: TAs | Head: lead owner | Head: sales owner |
| Comment | Yes | — | Yes | Yes | Yes |
| Onboard prospect as client | Yes | — | — | — | Yes |
| Convert won to project | Yes | — | — | — | — |
| Copy share link | Yes | Yes | Yes | Yes | Yes |

TA sees the **hiring budget** (what can be offered to a candidate) in place of the client budget. Stage limits for Lead Generation and Sales are BR-PLT-04 and BR-PLT-05 in FSD-01.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Pipeline screen** | | | |
| FR-PIP-001 | The screen is titled **Staffing Pipeline** and opens as a board. A toggle switches to a list. | v4.0 | `Live` |
| FR-PIP-002 | The board has one column per active stage (Requirement, Qualification, Budgeting, Candidate Mapping, Interview, Agreement) plus On Hold. Won and Lost columns appear when **Show won / lost** is ticked. — Each column header shows the requirement count, total positions and, for roles that see value, the column's monthly value. An asterisk marks a column where some requirements carry no value. | v1.0 | `Live` |
| FR-PIP-003 | A board card shows the title, a priority badge when priority is not medium, the company with a *prospect* tag where relevant, days in the current stage, the value per month or "Not valued", and the skills. A card with a follow-up due is tinted red. In the list view, a globe marks requirements that are on the job board. | v4.0 | `Live` |
| FR-PIP-004 | The list shows Requirement, Company, Stage, Engagement, Filled, Budget (Hiring Budget for TA) and Next Step, 20 rows to a page. It can be filtered by stage, and sorted by **Longest in stage**. | v4.0 | `Live` |
| FR-PIP-005 | Search matches title, company, primary skill and location, on both the board and the list. | v1.1 | `Live` |
| FR-PIP-006 | A searchable **company filter** lists only the companies on the board being viewed, grouped into Clients and Prospects, each with its requirement count. It filters both board and list and resets paging. | v4.0 | `Live` |
| FR-PIP-007 | A row of five count KPIs (Open, Filled, On Hold, Lost, Follow-ups Due) shows each as requirements with their positions underneath. Every role sees it. BR-PIP-05 has the definitions. | v4.0 | `Live` |
| FR-PIP-008 | A row of five value KPIs (Open Pipeline, Weighted, Won, Lost, Average Deal) is hidden from TA. Totals are grouped by currency and say how many requirements actually carry a value. | v2.3 | `Live` |
| FR-PIP-009 | Every KPI has an info icon. Clicking or tapping it opens a note giving the KPI's base and rule. | v4.0 | `Live` |
| **Adding and editing a requirement** | | | |
| FR-PIP-010 | A requirement records: company, title, experience range, primary, secondary and other skills, work mode, location, timezone, engagement type, positions required, currency, client budget range, deal value, hiring budget range, JD, working days and hours, priority, next step and next-step date. Admin also sets the public company label and whether the client may be named on the job board. | v2.4 | `Live` |
| FR-PIP-011 | The company is chosen from one searchable picker holding clients and prospects in two groups. Typing a name that is in neither list creates a new prospect. | v3.1 | `Live` |
| FR-PIP-012 | **Save and add another** on the create form saves the requirement and keeps the form open. The engagement fields carry over, the role fields clear, the cursor returns to Title, and a running count shows how many have been added. — Carried over: company, engagement type, work mode, location, timezone, working days and hours, priority, currency. Cleared: title, JD, skills, experience, positions, budgets, next step. | v3.1 | `Live` |
| FR-PIP-013 | A new requirement starts at Requirement, gets a share link, and records "Opportunity created" in its stage history. A Lead Generation user who creates one becomes its lead owner. Requirements created by anyone else start with no owner. | v3.0 | `Live` |
| FR-PIP-014 | **Edit requirement** changes every field on the form except stage and owners, which have their own controls so that history and permissions are kept. | v2.1 | `Live` |
| FR-PIP-015 | Requirements cannot be deleted from any screen. A requirement that has been converted to a project cannot be deleted at all. | v1.0 | `Live` |
| **Requirement page** | | | |
| FR-PIP-016 | The requirement page shows the qualification details, the JD, the interview-question sets, mapped candidates, owners, suggested profiles, the discussion and the stage history. The header shows the current stage and how long it has been there. The badge turns amber at 14 days. | v4.0 | `Live` |
| FR-PIP-017 | The header offers only the actions the viewer may take: Publish to job board, Onboard as client, Edit requirement, Share link, Move stage, Convert to Project, View project. | v3.0 | `Live` |
| **Stages** | | | |
| FR-PIP-018 | **Move stage** moves a requirement to any stage the viewer is permitted, forwards or back, with an optional note. Moving to Lost or On Hold requires a reason. | v1.0 | `Live` |
| FR-PIP-019 | Resuming from On Hold offers the stage it was on before the hold as the default. | v1.0 | `Live` |
| FR-PIP-020 | Every move is written to the stage history with from and to stages, the note or reason, who moved it and when. | v2.4 | `Live` |
| FR-PIP-021 | Moving to Won or Lost takes the requirement off the public job board, and the screen says so. | v2.2 | `Live` |
| **Owners** | | | |
| FR-PIP-022 | Each requirement has a **lead owner** (who brought it in), a **sales owner** (who closes it) and any number of **TA assignees**. None of the TAs is primary. Every assignee sees the requirement on their board and is alerted to its applicants. | v3.0 | `Live` |
| FR-PIP-023 | Owner pickers offer only active accounts of the right role, and within a head's team where a head is setting them. | v3.0 | `Live` |
| **Discussion and follow-up** | | | |
| FR-PIP-024 | The discussion has two tabs, **Team** and **Stakeholder**, each with a count. Team comments carry the signed-in user's name automatically. | v2.1 | `Live` |
| FR-PIP-025 | A comment can be marked as a follow-up, and then needs a date. | v1.0 | `Live` |
| FR-PIP-026 | A requirement whose next-step date is today or earlier counts as **follow-up due**. It is tinted on the board and list and counted in Follow-ups Due. | v1.0 | `Live` |
| **Share link** | | | |
| FR-PIP-027 | **Share link** copies a hard-to-guess public link to the requirement. It works without signing in. | v1.0 | `Live` |
| FR-PIP-028 | The shared page shows the title, company name, experience, skills, work mode, location, timezone, engagement type, positions, JD, and working days and hours. It never shows budgets, deal value, client contacts, candidates or internal comments. | v1.0 | `Live` |
| FR-PIP-029 | A consultant on the shared page can post a comment, which lands in the Stakeholder tab, and suggest a profile (see FSD-04). Once the requirement is Won or Lost the page stops taking suggestions. | v2.0 | `Live` |
| **Handover** | | | |
| FR-PIP-030 | **Onboard as client** turns a prospect into a client. It reuses a client with the same name if one exists, marks the prospect converted, and moves every requirement for that prospect onto the client. | v3.0 | `Live` |
| FR-PIP-031 | **Convert to Project** on a Won requirement creates the project with its manager's details, creating the client first if the company is still a prospect. It can also open deployments for candidates marked Joined. BR-PIP-07 has the rules. | v1.0 | `Live` |
| FR-PIP-032 | Once converted, the requirement links to its project, cannot change stage, and cannot be converted again. | v1.0 | `Live` |

## 4. Business rules

### BR-PIP-01 · Stages

Active stages, in order: Requirement, Qualification, Budgeting, Candidate Mapping, Interview, Agreement. Closing stages: Won, Lost, On Hold. Movement is allowed in both directions, because requirements do slip back. A move to the stage the requirement is already on is refused. A reason is kept only on Lost and On Hold, and is cleared when the requirement reopens.

### BR-PIP-02 · Requirement value (per month)

Value is the deal value where one is entered. Otherwise it is the top of the client budget range multiplied by the positions required, using the bottom of the range if no top is given. With neither, the requirement has *no value*. It is shown as "Not valued" and left out of totals and averages, never counted as zero.

```text
value = deal value
      otherwise  (budget max, or budget min) × max(1, positions)
      otherwise  none
```

### BR-PIP-03 · Weighted pipeline

Each open requirement's value is multiplied by the win probability for its stage, then the results are summed by currency.

| Requirement | Qualification | Budgeting | Cand. Mapping | Interview | Agreement |
|---|---|---|---|---|---|
| 10% | 25% | 40% | 60% | 75% | 90% |

### BR-PIP-04 · Currency

A requirement has one currency (INR, AED or USD). Values are never converted: every total is shown per currency, for example "₹6.6L · AED 40K".

### BR-PIP-05 · Count KPIs

**Open**: requirements in any of the six active stages, with the positions they ask for. **Filled**: requirements in Won. Its positions are the seats actually taken, which is positions required less those still pending. **On Hold** and **Lost**: requirements in those stages with their positions. Lost counts all time. **Follow-ups Due**: requirements in any stage whose next-step date is today or past.

```text
pending  = max(0, positions required − candidates at selected, offered or joined)
seats taken = positions required − pending
```

### BR-PIP-06 · Days in current stage

Days since the most recent stage move. A requirement that has never moved counts from the day it was created. Resuming from hold restarts the count. At 14 days or more the figure turns amber. The candidate stall list in FSD-03 uses the same 14-day threshold.

### BR-PIP-07 · Converting a won requirement

Only a Won requirement can be converted, and only once. If deployments are requested, each candidate marked Joined gets a resource record (reusing one that matches on email, or creating one) and a 100% billable deployment starting today, billed at the candidate's expected billing. A candidate whose resource already has any allocation is skipped, and named in the result, so nobody is booked past 100%.

### BR-PIP-08 · JD change stamp

Editing a requirement records when the JD text last changed, and only when the text itself differs. Interview-question sets use this stamp to say they were generated from an older JD.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Requirement | opportunities | All fields in FR-PIP-010, plus stage, closing reason, the three owner links, the prospect link, share token, job-board fields, JD-change stamp, and the project it was converted into. |
| Stage history | opportunity_stage_history | One row per move: from, to, note, who, when. |
| Discussion | opportunity_comments | Body, author name and account, Team or Stakeholder, follow-up flag and date. |
| TA assignees | opportunity_assignees | One row per TA per requirement, unique, with who assigned them. |
| Prospect | prospects | Company name, contact name, email and mobile, notes, who added it, and the client it became. |
| Retired | opportunities.owner, owner_user_id | The original single owner, as free text and as an account link. Kept for history. Nothing reads or writes either. |

## 6. Interfaces

- **Clients (FSD-08)**: requirements belong to a client or a prospect. Onboarding creates the client.
- **Projects and Deployments (FSD-09, FSD-10)**: conversion creates the project, and optionally resources and deployments.
- **Candidates (FSD-03)**: mapped candidates supply the filled positions and the joined list for conversion.
- **Job Board (FSD-04)**: listing state is held on the requirement. Closing a requirement removes its listing.
- **Role Workspaces (FSD-05)**: the owners and assignees here decide what appears on each personal board.
- **Dashboard (FSD-13)**: the pipeline panel and the forward-looking value KPIs read from here.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M8  
  Board and list, stage history, hold and resume, the discussion, the share link, onboarding a prospect, and converting a won requirement to a project.
- **v1.1** · 7 Sep 2026 · 67df20d · —  
  Search, filters and paging on the list.
- **v2.0** (major) · 7 Sep 2026 · cf2805b · M10 M13  
  Role-based access. A separate hiring budget, with the client budget withheld from TA. Stakeholder comments split from team comments.
- **v2.1** · 7 Sep 2026 · de09662 · M12  
  Admin can edit a requirement in place.
- **v2.2** · 7 Sep 2026 · aedf57b · M16  
  Job-board listing controls, and removal from the board on Won or Lost.
- **v2.3** · 7 Sep 2026 · e67ec24 · M17 M18  
  Requirement value, currency per requirement, the weighted pipeline, and the value KPI row with coverage notes.
- **v2.4** · 8 Sep 2026 · 854d4a7 · M21 M24  
  Comment and stage-move authors taken from the session. The public client label moved onto the Admin-only form.
- **v3.0** (major) · 17 Sep 2026 · 3baa593 · M42 M43 M45 M46  
  Lead owner, sales owner and TA assignees. Lead Generation and Sales limited to their own requirements and stages. Prospects stored as records.
- **v3.1** · 24 Sep 2026 · 686d99f · M47 M48  
  Searchable company picker, and Save and add another.
- **v4.0** (major) · 24 Sep 2026 · b77ca63 · M52–M56 — **current**  
  Renamed Staffing Pipeline. Company filter, days in current stage, and info notes on every KPI. The count KPIs replaced by Open, Filled, On Hold, Lost and Follow-ups Due. **Filled now means Won only**, which changes what that figure reports, hence the major version. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-PIP-01 | Withhold deal value and value KPIs from Lead Generation on the pipeline screen — The requirement page already withholds deal value from Lead Generation, but the pipeline screen and list API send it, and the value row is shown to them. That contradicts the Phase 12 decision. See section 9. | This review | High | `Proposed` |
| FS-PIP-02 | Restrict deleting a requirement to Admin — No screen offers deletion, but the server accepts it from Lead Generation and Sales for any requirement, owned or not. See section 9. | This review | High | `Proposed` |
| FS-PIP-03 | More pipelines: Project, Leadgen, AI POCs, Interviews — Each will be planned separately. When the second one arrives, decide whether they share a common route prefix. `/pipeline` stays where it is until then. | Product Owner, Phase 15 | Next | `Planned` |
| FS-PIP-04 | Mark the prospect converted when a won requirement is converted to a project — Onboarding marks the prospect converted and moves its requirements by key. Converting a prospect's requirement straight to a project creates the client by name only, and leaves the prospect open. | This review | Medium | `Proposed` |
| FS-PIP-05 | Show Convert to Project to Admin only — Other roles see the button on a Won requirement and get a refusal when they use it. | This review | Low | `Proposed` |
| FS-PIP-06 | Won and Lost for a period — Both KPIs count all time today. A this-month or this-quarter view was part of the original Phase 6 idea. | Plan M18 | Medium | `Proposed` |
| FS-PIP-07 | Tune stage win probabilities from real results — The percentages in BR-PIP-03 are starting values. Once enough requirements have closed, they can be set from actual stage-to-won rates. | Plan M18 | Later | `Proposed` |
| FS-PIP-08 | Total contract value — Value is a monthly run-rate. A contract-length field would give a total and an annual figure. | Plan P6 | Later | `Deferred` |
| FS-PIP-09 | Restrict share links to named people, or make them expire — Needs sign-in or email for outside consultants. | Plan P2 | Later | `Deferred` |
| FS-PIP-10 | Stage-flow reporting — Average time spent in each stage, and stage-to-stage conversion, computed from the stage history already recorded. | This review | Later | `Proposed` |

## 9. Known limitations

> **Two access gaps, found while writing this document.** (1) On the pipeline screen, Lead Generation users receive deal value and see the value KPI row. The Phase 12 decision was that they should see neither, and the requirement page does withhold deal value. (2) The server accepts a request to delete a requirement from Lead Generation and Sales without checking ownership. No screen offers deletion, so this can only be reached by calling the API directly. FS-PIP-01 and FS-PIP-02 would close these.

- **Filled starts at zero.** It counts Won requirements only, and fills as deals close.
- **The share link names the client.** Unlike the job board, the share page shows the company name, because it goes to a consultant chosen by the team. Anyone holding the link can read it.
- **Value covers only priced requirements.** Every value KPI says how many requirements it rests on. Totals in different currencies are never added together.
- **Conversion skips anyone already allocated.** A joined candidate whose resource has any existing allocation is not given a deployment. It must be placed by hand from Deployments.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v4.0 | First issue, written against commit `5e43f82`. |
