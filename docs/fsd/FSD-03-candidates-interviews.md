# Candidates & Interviews

`FSD-03 · CAN`

The people put forward for requirements: the candidate pool, the queue of applicants waiting for review, mapping a candidate to a requirement, interview rounds with panel feedback, and ratings against shared criteria.

| Field | Value |
|---|---|
| Module code | CAN |
| Module version | v3.1 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Candidates (Pool, Applicants) |
| Screens | /candidates · /candidates/[id] · requirement page |
| Owner | Product Owner |

## 1. Purpose and scope

A candidate is a person who could fill a requirement: someone on the internal bench, a profile from a partner or agency, a referral, a public applicant, or someone a recruiter found. A candidate can be put forward for several requirements at once, and progress is tracked separately on each, because the same person can be strong for one brief and weak for another.

### In scope

- The candidate pool: adding, editing, deleting and finding candidates.
- The applicant queue: reviewing inbound applications and referrals, logging calls, and approving or dismissing.
- Mapping a candidate to a requirement, and the candidate's status on it.
- Interview rounds, the panel, outcomes and feedback.
- Rating criteria and scores.
- The candidate detail page.

### Covered elsewhere

- The public apply form and the share-link referral form that feed the queue: FSD-04.
- Follow-through lists built from this data (upcoming interviews, stalled candidates, open offers) on the recruiter's board: FSD-05.
- Resume validation, formatting and interview-question agents: FSD-06.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| See pool, applicants, detail | Yes | Yes | Yes | — | Yes |
| Add, edit, delete candidates | Yes | — | Yes | — | Yes |
| Log calls, approve, dismiss applicants | Yes | — | Any TA | — | Yes |
| Map to a requirement, change status | Yes | — | Yes | — | Yes |
| Log interview rounds, rate | Yes | — | Yes | — | Yes |
| Add rating criteria | Yes | — | Yes | — | Yes |

Any TA may approve any applicant, whoever the requirement's assignees are. Assignment decides who is *alerted*, not who is *allowed*.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Candidate pool** | | | |
| FR-CAN-001 | Candidates has two tabs: **Pool** (approved candidates) and **Applicants** (inbound profiles waiting for review). The Applicants tab shows its count. | v2.3 | `Live` |
| FR-CAN-002 | The pool lists each candidate with skills, source, expected CTC, availability, the number of requirements they are mapped to, and a resume link where one exists. | v2.4 | `Live` |
| FR-CAN-003 | The pool can be searched by name, skill or agency, and filtered by source and by skill. | v1.0 | `Live` |
| FR-CAN-004 | A candidate records: name, designation, email, mobile, years of experience, location, primary, secondary and other skills, current and expected CTC (per year), notice period, last working date, resume link, source, source name, a link to a bench resource, and notes. | v2.4 | `Live` |
| FR-CAN-005 | Source is one of **In-house, Partner, Agency, Referral, Self-sourced**. Partner, Agency and Referral need a source name. In-house and Self-sourced must not have one. | v2.4 | `Live` |
| FR-CAN-006 | An in-house candidate can be linked to an existing bench resource, chosen from a searchable picker that fills in the profile. No other source can be linked. | v3.1 | `Live` |
| FR-CAN-007 | The account that adds a candidate is recorded as its author, whatever the source. | v2.4 | `Live` |
| FR-CAN-008 | The resume is a link to wherever the document already lives (Drive, SharePoint, an agency portal). The file itself is not stored. Only http and https links are accepted. | v2.4 | `Live` |
| FR-CAN-009 | A candidate cannot be deleted while mapped to any requirement at a status other than rejected or withdrawn. The message says how many live mappings are blocking it. | v1.0 | `Live` |
| **Applicant queue** | | | |
| FR-CAN-010 | The Applicants tab lists every application from the job board and every profile suggested through a share link. Each is labelled *Applied* or *Referred*, and marked *Waiting*, *In pool* or *Dismissed*. | v2.3 | `Live` |
| FR-CAN-011 | The queue can be searched by name, email or requirement, and filtered by call status. Each call-status option shows its count: Not called, Tried with no answer, Spoke to them, Unreachable. | v2.4 | `Live` |
| FR-CAN-012 | Each row shows the requirement, its TA assignees, the applicant's experience, notice period, and current and expected CTC. It also shows two duplicate warnings: **already in the pool**, and **applied to N other roles**. | v2.3 | `Live` |
| FR-CAN-013 | **Log call** records how the call went and a note, stamped with who called and when. Logging a call does not approve anyone. | v2.3 | `Live` |
| FR-CAN-014 | **Approve** creates a candidate from the application (source Referral, with the referrer as source name) and can map them to the requirement at Mapped in the same step. **Dismiss** closes it. Both record who decided, and neither can be applied twice. | v2.0 | `Live` |
| FR-CAN-015 | Opening the Applicants tab records when the user last looked. The sidebar badge then counts applicants that arrived since, for requirements where the user is an assignee. Admin, Management and TA heads see the whole queue counted. | v3.0 | `Live` |
| **Mapping to a requirement** | | | |
| FR-CAN-016 | From the requirement page a candidate is mapped with a status, an expected billing, an interview date and round, feedback, and an expected joining date. The candidate is chosen from a searchable picker. | v3.1 | `Live` |
| FR-CAN-017 | A candidate can be mapped to a requirement only once. Once the requirement is closed, the requirement page disables the button for mapping another candidate. | v1.0 | `Live` |
| FR-CAN-018 | Candidate status on a requirement: Mapped, Screening, Submitted, Interview, Selected, Offered, Joined, with Rejected and Withdrawn as exits. | v1.0 | `Live` |
| FR-CAN-019 | Every status change records when it happened. The first time a candidate reaches Offered, the offer date is recorded and never overwritten. | v2.5 | `Live` |
| FR-CAN-020 | The mapped-candidates table on a requirement shows each candidate's status, round, expected billing and resume link, with buttons for interview rounds, rating, editing and removing. | v2.4 | `Live` |
| **Interview rounds** | | | |
| FR-CAN-021 | Each interview round is kept as its own record: round number, type (Internal screening, Client round or Final), scheduled date, date held, outcome, feedback, recommendation and questions asked. A later round never overwrites an earlier one. | v2.3 | `Live` |
| FR-CAN-022 | Up to eight panel members can be named per round, each with an optional designation. | v2.3 | `Live` |
| FR-CAN-023 | A round with no outcome counts as scheduled, not yet held. Recording an outcome requires feedback. | v2.3 | `Live` |
| FR-CAN-024 | Logging an outcome suggests the candidate's next status and applies it in the same save: pass → Submitted, fail → Rejected, hold or no-show → stays at Interview. The recruiter can change the suggestion before saving. | v2.3 | `Live` |
| **Ratings** | | | |
| FR-CAN-025 | A candidate is scored 1 to 5 against each rating criterion, separately for each requirement, with an optional note per score. The average is shown alongside the individual scores, not in place of them. | v2.2 | `Live` |
| FR-CAN-026 | Criteria form a shared library. A criterion can apply everywhere, or to one requirement only. A new one added during an evaluation is offered for the next candidate. | v2.2 | `Live` |
| FR-CAN-027 | Scores can belong to the profile screening or to a particular interview round. | v2.3 | `Live` |
| **Candidate detail page** | | | |
| FR-CAN-028 | The candidate page shows the profile with monthly figures beside the annual CTCs, and availability. It shows **Where they came from** (the application or referral that brought them in, who referred and who approved them), and every requirement they are mapped to. Under each requirement it shows the interview rounds, panel and scores. | v2.5 | `Live` |
| FR-CAN-029 | The candidate page does not show expected billing. | v2.4 | `Live` |

## 4. Business rules

### BR-CAN-01 · Availability

A last working date takes precedence over a notice period, because a day count goes out of date and a date does not. A last working date already in the past reads as *available now*. It is never rejected as an error.

### BR-CAN-02 · Monthly CTC

CTC is entered per year. Monthly figures are the annual figure divided by 12, rounded to the rupee, and are never stored.

### BR-CAN-03 · Duplicate detection in the queue

An applicant is matched by email (ignoring case) and by the last 10 digits of their mobile number, so +91, a leading 0, spaces and hyphens make no difference. A match against any pool candidate shows *already in the pool*. A match against other applications shows how many.

### BR-CAN-04 · Filled positions

A position on a requirement counts as filled when a mapped candidate is at Selected, Offered or Joined. The pipeline's Filled KPI (FSD-02, BR-PIP-05) uses this count.

### BR-CAN-05 · Public intake never writes to the pool

Applications and referrals arrive from forms that need no sign-in, so they land in a staging queue. Only an explicit Approve by a signed-in user creates a candidate.

### BR-CAN-06 · Criteria are never deleted

A retired criterion is switched off, not removed, so scores already given against it stay readable.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Candidate | candidates | Fields in FR-CAN-004, plus the bench resource link and author. |
| Mapping | opportunity_candidates | Candidate, requirement, status, round, interview date, latest feedback, expected billing, status-changed date, offer date, expected joining date, who mapped and who last updated. |
| Interview round | candidate_interviews | Fields in FR-CAN-021, and who logged it. |
| Panel member | interview_panel | Name, designation, and an account link reserved for interviewer access (always empty today). |
| Rating criterion | rating_criteria | Label, description, whether global or for one requirement, sort order, active flag, author. |
| Score | candidate_ratings | Mapping, criterion, optional round, score 1 to 5, note, who rated. |
| Applicant | referrals | Applicant and referrer details, kind (Applied or Referred), status, call status, note, when and by whom, who decided, the candidate it became, and the employee who referred them once matched. |

The mapping still holds a single interview round, date and feedback. These now mirror the latest round, so older screens that read them keep working.

## 6. Interfaces

- **Staffing Pipeline (FSD-02)**: candidates are mapped on the requirement page. Joined candidates feed conversion to a project.
- **Resources (FSD-07)**: an in-house candidate links to a bench resource. Conversion creates a resource for an external hire.
- **Job Board & Referrals (FSD-04)**: supplies the applicant queue.
- **Role Workspaces (FSD-05)**: My Work reads mappings, rounds and the queue for pending actions and KPIs.
- **AI Agents (FSD-06)**: question sets are grouped by this module's rating criteria.
- **Dashboard (FSD-13)**: source effectiveness is counted from candidates and their mappings.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M9  
  Candidate pool with In-house, Partner and Agency sources, bench link, mapping with statuses, and the delete guard.
- **v2.0** (major) · 7 Sep 2026 · cf2805b · M10 M13  
  Role-based access, with TA given full use. Referral inbox from share links, with approval into the pool.
- **v2.1** · 8 Sep 2026 · 854d4a7 · M21 M23  
  Mapping authors recorded from the session. Referrer captured on public applications.
- **v2.2** · 9 Sep 2026 · 61e0918 · M22  
  Rating criteria library and 1–5 scores per requirement.
- **v2.3** · 10 Sep 2026 · 7166e56 · M26 M27 M29  
  Applicants tab with call log and duplicate warnings. Seen watermark and badge. Interview rounds with panel. An outcome moves the candidate in the same save.
- **v2.4** · 13 Sep 2026 · 90ab7fc · M32–M36  
  Resume link, call-status filter, last working date, Self-sourced with author, and the candidate detail page.
- **v2.5** · 15 Sep 2026 · 9e78493 · M30 M39  
  Status-change and offer dates, expected joining date, and monthly CTC on the detail page.
- **v3.0** (major) · 17 Sep 2026 · 3baa593 · M41 M42  
  Sales given access. Applicant alerts scoped to a requirement's TA assignees instead of a single owner.
- **v3.1** · 24 Sep 2026 · 686d99f · M47 — **current**  
  Searchable pickers for mapping a candidate and for the bench link. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-CAN-01 | Client submission pack — Shortlist candidates on a requirement and send the client one link with their formatted profiles. This is the most-repeated manual step in TA's work. It needs decisions first: which fields, how long the link lasts, and whether it is tied to one client contact. | Plan M30-1 | High | `Deferred` |
| FS-CAN-02 | Should TA see expected billing on a mapping? — Client budget and deal value are withheld from TA, but TA sees and edits a mapping's expected billing on the requirement page. The candidate page shows none. This needs a decision either way. | Plan P10 | Medium | `Proposed` |
| FS-CAN-03 | Interviewer access — Interviewers sign in, see only their scheduled rounds with the candidate and JD, and record feedback and the questions they asked. The panel's account link is already reserved for it. | Plan M31 | Later | `Deferred` |
| FS-CAN-04 | Resume link on the public apply form — An approved applicant currently arrives in the pool with no CV link. | Plan P10 | Medium | `Proposed` |
| FS-CAN-05 | Record the approver as author when an applicant is approved — The approver is recorded on the application but not as the new candidate's author, so approved candidates show no author in reports by person. | This review | Low | `Proposed` |
| FS-CAN-06 | Warn about duplicates when adding a candidate by hand — The applicant queue flags duplicates. The Add Candidate form does not. | This review | Medium | `Proposed` |
| FS-CAN-07 | Save and add another on the candidate form — For agencies that send several profiles at once. Declined for Phase 14, and small whenever it is wanted. | Plan P14 | Low | `Deferred` |
| FS-CAN-08 | Keep copies of CVs, or accept that links can break — Links to an agency portal stop working when the agency relationship ends. Keeping copies needs a retention and access policy first. | Plan P10 | Later | `Proposed` |
| FS-CAN-09 | Weighted rating criteria — Criteria are unweighted today. Weighting waits until enough hires exist to show which criteria predict success. | Plan P8 | Later | `Deferred` |
| FS-CAN-10 | WhatsApp or email to candidates — Needs a provider, message templates, consent handling and an audit trail. Large enough to be a phase of its own. | Plan M30 | Later | `Deferred` |

## 9. Known limitations

- **Applications become Referral-sourced candidates.** Approval sets source to Referral, with the referrer as source name. For a direct application, the referrer is the applicant, so source-effectiveness figures count job-board applicants under Referral.
- **Any TA can approve any applicant.** This is by design. Alerts are scoped by assignment, permissions are not.
- **Panel members are typed names.** Nobody on a panel has a login until FS-CAN-03.
- **The resume is a link, not a file.** See FS-CAN-08.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v3.1 | First issue, written against commit `5e43f82`. |
