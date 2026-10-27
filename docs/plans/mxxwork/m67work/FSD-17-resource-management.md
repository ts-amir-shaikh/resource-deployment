# Resource Management — Skill Matrix & Monthly Reviews

`FSD-17 · RMG`

The Resource Manager keeps a skill matrix of every resource and writes the monthly reviews: an account review per client and a performance review per deployed resource, with the client's feedback recorded on its behalf. Admin approves them; the history makes trends visible.

| Field | Value |
|---|---|
| Module code | RMG |
| Module version | v1.2 |
| Doc revision | Rev 1.2 |
| Status | `Built` — on branch `feat/m67-resource-review`, not yet released |
| Plan module | M67 |
| Appears as | Reviews · Skill Matrix · Account Reviews (Sales) |
| Screens | /reviews · /reviews/performance/[id] · /reviews/accounts · /reviews/accounts/[id] · /skills |
| Decisions | D2 (the Resource Manager role), D13 (client feedback recorded by us, no client login); plan Q1–Q7 settled with the user on 23 Oct 2026 |
| Gaps closed | G-RM-02 (resources), G-RM-05, G-RM-07 (trends) |
| Owner | Product Owner |

## 1. Purpose and scope

Before this module the Resource Manager could only approve timesheets (M65), skills were free text on a resource, and nothing recorded how an engagement or a person was doing month to month.

```
Each month:  every client with someone deployed  → account review      draft → submitted → approved
             every deployment active that month  → performance review  draft → submitted → approved
                                                     (scores 1–5, text, client feedback)
                                    Admin may return a submitted review to draft, with a reason.
```

Not in scope (deferred, by decision): the **Health report** (Q1, undefined), a client login for feedback (G-RM-09), candidate proficiency (G-TA-04), editable per-client templates (rest of G-RM-07), utilisation and bench views (G-RM-03, G-RM-06).

## 2. Users and access

| Action | Admin | Management | Resource Manager | Sales member | Sales head | Resource, TA, Leadgen, others |
|---|---|---|---|---|---|---|
| See the month tracker and performance reviews | Yes | Yes | Yes | — | — | — |
| See account reviews | All | All | All | Approved, of clients where they own a requirement | Approved, of clients any salesperson owns a requirement at | — |
| Start, edit and submit a review | Yes | — | Yes | — | — | — |
| Approve, or return with a reason | Yes | — | — | — | — | — |
| Manage review criteria | Yes | — | Yes | — | — | — |
| See the skill matrix | Yes | Yes | Yes | — | — | — |
| Set skill levels; manage the skills list | Yes | — | Yes | — | — | — |

**Resources never see their reviews** (Q5). Sales sees no performance data: on an account review it gets who is deployed, not their scores. A row out of reach answers **404** on page and API alike. Paths and write rules are in `lib/access.ts`; row scoping in `lib/reviews.ts`.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-RMG-001 | **Month tracker (G-RM-05).** `/reviews` shows, for a chosen month, every client with a deployment active that month (account reviews) and every such deployment (performance reviews), each with its status, rating or average, and a Start or Open action. Counts of approved, waiting for Admin and not started. | v1.0 | `Built` |
| FR-RMG-002 | **Performance review.** One per deployment per month. Scores 1–5 on each active criterion, with an optional note each; summary, strengths, to-improve. The average is shown live and is blank, never 0, when nothing is scored. | v1.0 | `Built` |
| FR-RMG-003 | **Client feedback (D13).** On the performance review: what the client said, who said it (name and role) and when. Recorded by the Resource Manager or Admin; the client has no login. | v1.0 | `Built` |
| FR-RMG-004 | **Timesheet context.** The performance review shows that month's approved timesheet figures for the deployment: days approved of expected, worked, paid and unpaid leave (FSD-18). | v1.0 | `Built` |
| FR-RMG-005 | **Account review.** One per client per month: a green/amber/red rating, summary, risks, growth opportunities, actions, and the people deployed that month with their performance review status and average. | v1.0 | `Built` |
| FR-RMG-006 | **Approval (Q3).** The Resource Manager submits; Admin approves, or returns it to draft with a reason that is shown on the draft until it is submitted again. Submitting locks the review: only a draft can be edited, by anyone. Admin changes a locked review by reopening it (FR-RMG-013), not by editing it in place. | v1.0 | `Built` |
| FR-RMG-007 | **Trends (G-RM-07).** A performance review shows the resource's last six months of reviews across clients, per criterion and average. An account review shows the client's last six monthly ratings. | v1.0 | `Built` |
| FR-RMG-008 | **Review criteria (Q4, Q7).** A managed list, seeded with Technical skill, Communication, Reliability & timesheets and Client satisfaction. Add, retire, restore; never delete. At least one stays active. A review scored on a since-retired criterion still shows it. | v1.0 | `Built` |
| FR-RMG-009 | **Skill matrix (G-RM-02).** `/skills` lists every resource with their assessed skills and levels (1 Beginner … 5 Expert), filterable by skill and minimum level. The Resource Manager sets a resource's levels together. | v1.0 | `Built` |
| FR-RMG-010 | **Skills list.** A catalogue, unique case-insensitively. Add, rename, retire, restore; never delete. A retired skill is not offered for new levels; existing levels on it stay. Seeded once from the free-text skills on resources. | v1.0 | `Built` |
| FR-RMG-011 | **Account reviews for Sales (Q5).** `/reviews/accounts` lists account reviews across months; Sales sees only the approved reviews of its clients, without performance data. | v1.0 | `Built` |
| FR-RMG-012 | **Extra criteria on one review.** The Resource Manager or Admin can add up to five criteria of their own to a single performance review (for example Mentoring), scored 1–5 like the standard ones, with an optional description and note. They belong to that resource's review for that month alone: they are not added to anyone else's review or to the next month, and the standard criteria and trend columns are unchanged. They count in the review's average, and each must be scored before the review can be submitted. "Copy last month's" offers the previous month's extras for the same engagement, unscored, and applies nothing by itself. A name may not repeat on a review or match a standard criterion. | v1.1 | `Built` |
| FR-RMG-013 | **Reopen (performance and account reviews).** Admin can reopen a submitted or an approved review, giving a reason. It goes back to a draft, shown with that reason; an approved review stops being approved, so Sales no longer sees an account review until it is approved again. Return still reaches a submitted review only. The Resource Manager cannot reopen. | v1.2 | `Built` |
| FR-RMG-014 | **Versions.** Every submit locks the review as the next numbered version: a snapshot of what it said, who locked it and when. A review locked before versioning existed is captured as version 1 when Admin first reopens or returns it. Snapshots hold criterion names rather than ids, so renaming or retiring a criterion does not rewrite them. | v1.2 | `Built` |
| FR-RMG-015 | **Change note.** Every submit after the first must say what changed since the last version; the first needs none. The note is kept with the version. | v1.2 | `Built` |
| FR-RMG-016 | **Version history.** Both review pages list the versions newest first, each with who, when, the note, and the differences from the version before it: scores, extra criteria, the average, text and feedback (performance); rating and text (account). Visible to Resource Manager, Admin and Management. Sales receives no version data. | v1.2 | `Built` |

## 4. Business rules

- **BR-RMG-01 What is due.** A performance review is due for every deployment active on any day of the month (`start ≤ month end`, and no end or `end ≥ month start`), billable or shadow. An account review is due for every client with at least one such deployment.
- **BR-RMG-02 One per period.** One performance review per deployment per month, one account review per client per month, enforced by unique indexes. Starting one that exists opens it.
- **BR-RMG-03 Status moves.** Draft → Submitted (submit). Submitted → Approved (approve) or → Draft (return, reason required). Nothing else. Each move is checked against the status it was read with, so two people acting at once cannot both succeed.
- **BR-RMG-04 Submitting** a performance review needs a score on every active criterion; an account review needs a rating and a summary.
- **BR-RMG-05 Average** is the mean of the stored scores to one decimal, derived on read, never stored, and null when unscored.
- **BR-RMG-06 Skill names** are trimmed and single-spaced; two names differing only in case are the same skill.

## 5. Data

| Table | Holds |
|---|---|
| `skills` | name (unique on `lower(name)`), active |
| `resource_skills` | resource, skill, level 1–5, assessed by and when; one row per pair |
| `review_criteria` | label, description, order, active |
| `performance_reviews` | deployment, resource, client, period `YYYY-MM`, status, summary, strengths, improvements, client feedback / by / date, submitted / approved by and when, returned reason |
| `performance_review_scores` | review, criterion, score 1–5, note; one per pair |
| `account_reviews` | client, period, status, rating, summary, risks, opportunities, actions, submitted / approved by and when, returned reason |

All new tables; no existing column changes. The migration adds the four default criteria when the table is empty and adds every distinct free-text skill on resources to the catalogue with `insert or ignore`, so a re-run changes nothing and a retired skill stays retired. `db:clean` and `db:seed` clear the review and level tables; the catalogue and criteria are configuration and stay. `npm run db:seed-reviews` adds mock reviews over four months and skill levels, and does nothing where data exists.

## 6. Interfaces

| Route | Does |
|---|---|
| `GET /api/reviews?period=` | The month tracker |
| `POST /api/reviews/performance` | Start (or open) a deployment's review for a month |
| `GET/PUT /api/reviews/performance/[id]` | Detail with criteria, scores, timesheet and history; save a draft |
| `POST /api/reviews/performance/[id]/submit · approve · return` | Status moves (approve and return: Admin) |
| `GET/POST /api/reviews/accounts` | List (scoped for Sales); start (or open) a client's review |
| `GET/PUT /api/reviews/accounts/[id]` | Detail; save a draft |
| `POST /api/reviews/accounts/[id]/submit · approve · return` | Status moves (approve and return: Admin) |
| `GET/POST /api/reviews/criteria`, `PUT /api/reviews/criteria/[id]` | Criteria |
| `GET/POST /api/skills`, `PUT /api/skills/[id]` | The matrix; the skills list |
| `PUT /api/skills/resources/[id]` | A resource's levels |

Every response is built field by field: no billing, commission, overhead or CTC figure is selected.

## 7. Version history

| Version | Plan module | Change |
|---|---|---|
| v1.0 | M67 | First build. |

## 8. Known limitations

- The Health report is not built; it needs defining with the Product Owner (Q1).
- Reviews are not reminded or escalated; the tracker shows what is outstanding.
- The history table shows the criteria active today plus any this review was scored on; a criterion retired before this review and scored only on older ones is counted in their averages but has no column.
- Candidates have no skill levels yet (G-TA-04).

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 23 Oct 2026 | v1.0 | First issue, written against branch `feat/m67-resource-review`. |
| 1.1 | 27 Oct 2026 | v1.1 | Extra criteria on a single review (FR-RMG-012), requested by the team head, and Admin editing a submitted performance review (FR-RMG-013). One additive table, `performance_review_extra_scores`. |
| 1.2 | 27 Oct 2026 | v1.2 | Locking, Reopen and versioning, from the product owner's note. Admin editing a submitted performance review in place (FR-RMG-013 in Rev 1.1) is withdrawn: Admin reopens instead. Two additive tables, `performance_review_versions` and `account_review_versions`. A final lock and a chain of approvals are left for the next phase. |
