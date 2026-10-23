---
title: M67 Resource & account review — skill matrix, monthly reviews, client feedback
type: feat
date: 2026-10-23
branch: feat/m67-resource-review
base: feat/m66-leadgen (d9cd212)
status: approved — building
---

# M67 Resource & account review

## Goal Capsule

- **Objective:** give the Resource Manager the skill matrix and the monthly reviews the platform vision assigns them — an account review per client and a performance review per deployed resource, with client feedback recorded on the client's behalf, approval by Admin, completion tracked and scores trended.
- **Covers:** G-RM-02 (skill matrix, resources only), G-RM-05 (monthly reviews), G-RM-07 (trends; editable templates deferred), D13 (client feedback recorded internally).
- **Out of scope:** the **Health report** (undefined; deferred by the user on 23 Oct 2026), a client login (G-RM-09), candidate proficiency (G-TA-04), editable review templates, money of any kind.
- **Stop conditions:** stop and ask before any `npm run db:*`; before changing timesheet or invoice behaviour.

## Decisions (23 Oct 2026, with the user)

| # | Question | Decision |
|---|---|---|
| Q1 | What is the Health report? | **Left out for now.** Defined with the Product Owner later. |
| Q2 | Who records client feedback (D13)? | **Resource Manager** (and Admin), noting which client contact gave it and when. The client's "Account Manager" field is a contact name, not a user. |
| Q3 | Who approves reviews? | Resource Manager **submits**; **Admin approves**, or returns it with a reason. |
| Q4 | Review fields | Performance: fixed criteria scored 1–5 — Technical skill, Communication, Reliability & timesheets, Client satisfaction — plus summary, strengths, improvements and client feedback. Account: green/amber/red rating, summary, risks, growth opportunities, actions. |
| Q5 | Who sees reviews | Resource Manager, Admin; Management read-only. **Sales reads approved account reviews of clients where it owns a requirement** (a Sales head: every client with a sales owner). **Resources never see their reviews.** TA, Leadgen, Accounts, Interviewer: nothing. |
| Q6 | Skill matrix scope | Resources only. |
| Q7 | Templates | Criteria are a managed list (like rating criteria): retire, never delete. Editable per-client templates later. |

## Data (additive only)

| Table | Holds |
|---|---|
| `skills` | The skill catalogue. Name unique case-insensitively. Retired, never deleted. Backfilled once from resources' free-text skills. |
| `resource_skills` | Level 1–5 per resource per skill, who assessed it and when. One row per pair. |
| `review_criteria` | Performance criteria. Seeded with the four defaults when the table is empty. |
| `performance_reviews` | One per **deployment per month** (`period` = `YYYY-MM`). Status `draft → submitted → approved`; returned to draft with a reason. Client feedback fields. |
| `performance_review_scores` | One score 1–5 per criterion per review. |
| `account_reviews` | One per **client per month**. Same status flow. |

No column is added to an existing table. `scripts/migrate.ts` gains two idempotent backfills (criteria defaults, skills catalogue).

## Rules (`lib/review-rules.ts`, pure, unit-tested)

- A **period** is `YYYY-MM`; its bounds are the first and last day of the month.
- A **performance review is due** for every deployment active at any point in the month (`start ≤ month end` and `end` null or `≥ month start`). An **account review is due** for every client with at least one such deployment.
- **Transitions:** `draft → submitted` (submit; every criterion scored), `submitted → approved` (approve), `submitted → draft` (return, reason required). `approved` is final. Only a draft can be edited.
- **Average score** is derived, never stored, and is `null` — not 0 — when nothing is scored.
- Skill names are normalised (trimmed, single-spaced) and compared case-insensitively.

## Access (`lib/access.ts` only)

| Role | Read | Write |
|---|---|---|
| Resource Manager | `/reviews`, `/skills`, `/api/reviews`, `/api/skills` | Everything under those **except** `/approve` and `/return` |
| Admin | All | All |
| Management | All | None |
| Sales | `/reviews`, `/api/reviews/accounts` (rows filtered server-side to approved reviews of its clients) | None |
| Others | None | None |

Response shapes for Sales are built by allowlist and carry no performance data.

## Units

1. **U1 Rules + tests** — `lib/review-rules.ts`, `lib/review-rules.test.ts`.
2. **U2 Schema + migration** — `lib/schema.ts`, `lib/ddl.ts`, `scripts/migrate.ts` backfills, `scripts/clean.ts`.
3. **U3 Access + tests** — `lib/access.ts`, nav, landing; `lib/accounts/roles.test.ts`.
4. **U4 Server** — `lib/reviews.ts` (reads/writes, scoping, allowlisted shapes), Zod schemas in `lib/validations.ts`, routes under `app/api/reviews` and `app/api/skills`.
5. **U5 Screens** — `/reviews` (month tracker), `/reviews/performance/[id]`, `/reviews/accounts/[id]`, `/skills`.
6. **U6 Mock data** — `scripts/seed-reviews.ts` (`npm run db:seed-reviews`).
7. **U7 Docs** — FSD-17 (this folder), FSD-00A, FSD-01, FSD index, README, CLAUDE.md test counts. (FSD-05 is unchanged: no role workspace moved.)

## Verification

- `npx tsc --noEmit` clean; `npm test` green including the chokepoint scan.
- Manual walk-through on the test database as Resource Manager, Admin, Management, Sales and TA.
- `npm run build` is run by the user.
