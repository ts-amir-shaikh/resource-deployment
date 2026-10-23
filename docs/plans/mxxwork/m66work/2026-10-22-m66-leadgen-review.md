---
title: M66 Leadgen pipeline — review before merge
date: 2026-10-22
branch: feat/m66-leadgen
base: feat/m65-timesheets (e97ee8f)
status: awaiting review
---

# M66 Leadgen pipeline — review before merge

**For:** the reviewer approving `feat/m66-leadgen`.
**Read time:** about 10 minutes. The specs are [FSD-14](FSD-14-campaigns-outreach.md) and [FSD-15](FSD-15-prospects-meetings-leads.md); the plan is [here](2026-10-22-feat-m66-leadgen-pipeline-plan.md).

> **Merge order.** This branch was cut from `feat/m65-timesheets`, which has its own open PR. Merge M65 first; this PR then shows only M66.

---

## 1. What this delivers

The front of the funnel: campaign → prospect (with contacts) → activities and meetings → lead → handoff to Sales → requirement(s).

| Who | Gets | Screen |
|---|---|---|
| Lead Generation | A prospect list and stage board (temperature as a marker on each card), a prospect page with contacts and an activity/meeting timeline, conversion of a qualified prospect into a lead, handoff to Sales, campaigns with results, follow-ups due on My Leads | `/prospects`, `/campaigns`, `/lead-records`, `/leads` |
| Lead Generation head | The same across the team and unowned rows; sets owners | same |
| Sales | Every prospect and campaign read-only; the Sales queue and own leads on My Deals; raises requirements from a lead it holds | `/sales`, `/lead-records` |
| Sales head | Assigns queued leads to a salesperson | `/lead-records/[id]` |
| Admin | Everything, including the duplicate warning on Add Client | all of the above, `/clients` |
| Management | Views everything, changes nothing | — |
| TA, Resource, Resource Manager, Accounts, Interviewer | Nothing new; refused on every new route | — |

## 2. Decisions taken

Q1–Q7 of the plan were accepted as proposed (22 Oct 2026): new screens at `/prospects`, `/campaigns`, `/lead-records` with `/leads` unchanged; handoff to a Sales queue with a head assigning; convert only at Qualified; Leadgen own / head team / Sales read all; leads on existing clients plus BANT ticks with no gating; duplicates warn and allow "create anyway"; Leadgen may still create requirements directly.

Two choices made during the build, worth a glance:

- **A Lead Gen member who types a new company on the requirement form now owns the prospect it creates**, so it appears in their Prospects list. Before, the prospect had no owner. Nothing else about the form changed.
- **`db:clean` now also empties `prospects`, `prospect_contacts`, `campaigns`, `leads` and `activities`.** It never cleared `prospects` before, which left rows pointing at deleted clients after a cutover. `db:seed` clears only `activities` and `leads` (it still never touched prospects).

## 3. How it fits the existing system

- **Reuses the `prospects` table** (scope risk R6). New columns are added; the old single-contact columns stay and are no longer written by the new screens.
- **`GET /api/prospects` keeps its shape**, so the requirement form's company picker is unchanged (AE7). "Onboard as client" is untouched.
- **Access** lives in `lib/access.ts` (paths) and the pure `lib/leadgen-rules.ts` (rows), applied by `lib/leadgen-ownership.ts`. Every page calls `getViewer()`, every route `handle()`; the chokepoint scan covers the 19 new files.
- **Out-of-reach rows answer 404**, not 403, so a member cannot probe a colleague's prospect ids.
- Raising a requirement from a lead goes through the existing `POST /api/opportunities` with a `leadId`; the server takes the company and owners from the lead, never the form.

## 4. Database changes — additive only

| Change | Default / backfill |
|---|---|
| `prospects` + `stage`, `temperature`, `owner_user_id`, `source`, `campaign_id`, `website`, `industry`, `location`, `dead_reason`, `updated_at` | `new`, `cold`; owner = the Lead Gen account that created it |
| new `prospect_contacts` | the old single contact copied in as primary |
| new `campaigns`, `leads`, `activities` | empty |
| `opportunities` + `lead_id` | null |

The backfill skips any prospect already edited under M66 (`updated_at` set), so a re-run changes nothing. Old code ignores every new column, so the `deploy.sh` rollback rule holds.

**Run `npm run db:migrate` on production before deploying this code.**

## 5. Evidence it works

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **322 passed** (was 268): +29 leadgen rules, +6 access, +19 chokepoint entries |
| Migration on a scratch copy of the pre-M66 schema, run twice | columns added; owner and contact backfilled; second run changed nothing |
| `db:seed-leadgen` on a scratch DB, run twice | 3 campaigns, 12 prospects, 17 activities, 3 leads; second run added nothing |
| End-to-end through `lib/leadgen.ts` on the scratch DB | AE1 duplicate warn then create anyway; AE2 stage/temperature independent; AE3 convert once, only from Qualified; R4 meeting moves to Meeting set; AE4 handoff → queue → head assigns → holder may raise, Leadgen may not; AE5 campaign figures; AE6 member sees 4 of 12, head 12, TA 0, other member's prospect 404, Sales/Management 403 on edit |

**Not yet done:** clicking through the screens in a browser and `npm run build`. Both need the developer's environment (§7).

## 6. Risks and how they are contained

| Risk | Containment |
|---|---|
| Requirement form or onboarding breaks | Their routes and shapes are unchanged apart from the optional `leadId`; check AE7 by hand |
| A Leadgen member sees another's prospects | Row rules unit-tested; list and detail share one scope; 404 on out-of-reach rows |
| No CI gate; `main` auto-deploys | Run `npm test` and `npm run build` before pushing |
| Old code against the new schema on rollback | Only nullable or defaulted columns and new tables |

## 7. How to try it (test database, about 10 minutes)

1. `npm run db:migrate`, then `npm run db:seed-leadgen` (needs at least one Lead Gen and one Sales account to give rows owners).
2. As **Lead Gen**: open Prospects, switch board/list, open *Nimbus FinTech Pvt Ltd*, log a meeting, convert it (it is Qualified), hand the lead to Sales.
3. As a **Sales head**: My Deals shows the queue; open the lead, assign it.
4. As the assigned **Sales** member: Raise Requirement twice; both appear on the lead, which reads *Requirement raised*.
5. As **Admin**: Add Client "Nimbus Fintech Private Limited" — the warning names the prospect; "Add client anyway" works.
6. As **TA**: `/prospects` redirects away; `/api/leadgen/prospects` refuses.
7. Requirement form: pick a company, type a new one, onboard as client — all as before.

## 8. Not in this change (by the spec)

CSV import of target lists (G-LED-08), email sequences and calendar sync (G-LED-09), gating requirement stages on qualification (rest of G-SAL-03), an account view of an existing client for Sales (rest of G-SAL-02).

## 9. Files changed

- **Rules and data:** `lib/leadgen-rules.ts` (+ test), `lib/leadgen.ts`, `lib/leadgen-ownership.ts`, `lib/leadgen-api.ts`, `lib/schema.ts`, `lib/ddl.ts`, `lib/validations.ts`, `lib/prospects.ts`, `lib/access.ts` (+ `roles.test.ts`), `lib/client.ts`
- **API:** `app/api/leadgen/**` (13 routes); `app/api/opportunities/route.ts` (`leadId`), `[id]/route.ts` (owner on typed company); `app/api/clients/route.ts` and `app/api/prospects/route.ts` (duplicate warning)
- **Screens:** `app/prospects/**`, `app/campaigns/**`, `app/lead-records/**`; `app/leads/page.tsx`, `app/sales/page.tsx`, `app/clients/client.tsx`; components `leadgen-ui`, `prospect-form`, `campaign-form`, `activity-log`; `owner-board` gains a `panel` slot
- **Scripts:** `scripts/migrate.ts` (columns + backfill), `scripts/seed-leadgen.ts` (new), `scripts/seed.ts`, `scripts/clean.ts`, `package.json`
- **Docs:** FSD-14 and FSD-15 (this folder); FSD-00, 00A, 01, 02, 05, 08 and the FSD index; README; CLAUDE.md test counts

## 10. Reviewer checklist

- [ ] M65 merged first
- [ ] `npm test` and `npm run build` pass locally
- [ ] §7 walk-through done on the test database
- [ ] Two build-time choices in §2 accepted
- [ ] Production migration scheduled before the deploy
