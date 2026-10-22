# Platform vision and coverage

`FSD-00 · VIS · Rev 1.1`

The platform's aim, the departments it serves and the journey it runs, checked against the thirteen module FSDs as they stand at `5e43f82`. This page is the yardstick. Every later plan and FSD revision is checked against it.

| Field | Value |
|---|---|
| Review date | 27 Sep 2026 |
| Reviewed | FSD-01 to FSD-13, Rev 1.0 |
| Departments | 9 · 3 covered, 4 partial, 2 missing |
| Journey stages | 10 · 4 covered, 3 partial, 3 missing |
| Proposed new FSDs | FSD-14 to FSD-20 |
| New roles proposed | 4 |
| Status | `Decisions settled` |
| Owner | Product Owner |

## 1. Aim

**One platform where every department that finds, wins, fills, bills and runs a staffing engagement works on the same records.** Leadgen, sales, recruiting, accounts, the interview panel, resource management, the deployed resources themselves, admin and management each get their own view, and each hands work to the next without re-keying it.

The application today is strongest in the middle of that chain, from requirement to deployment. The two ends are thin or missing: the front, where outreach becomes a lead, and the back, where a deployed person's time turns into an invoice.

## 2. Departments

| Department | Responsibilities | Role today | Coverage | What exists / what is missing |
|---|---|---|---|---|
| Leadgen | Lead generation, cold calling, outreach, campaigns, prospect management | Lead Generation (+ head) | `Partial` | **Exists:** requirements up to Budgeting, the My Leads board, prospects as records. **Missing:** campaigns, outreach and call logging, meetings, a prospect list and lifecycle. A prospect can only be created by typing a new company on a requirement. |
| Inside Sales / Sales | Prospect to client, mapping, managing and generating requirements from existing clients | Sales (+ head) | `Partial` | **Exists:** pipeline with commercials, Budgeting to Won or Lost, onboarding a client, My Deals. **Missing:** any view of an existing client's account (contacts, projects, people deployed), because Clients is Admin-only. Also missing: meetings, and account-growth tracking such as repeat requirements per client. |
| Recruiters / TA | Fulfilment, candidate evaluation, talent pool, pipeline management | TA Team (+ lead) | `Covered` | **Exists:** pool, applicant queue, mapping, rounds, ratings, agents, My Work. **Missing:** the client submission pack (M30-1), booking interviews into panel slots, and talent-pool search by rated skill. |
| Accounts | POs and agreements, invoice creation and management | *none (Admin)* | `Partial` | **Exists:** the Agreements and Invoices modules, fully built, but only Admin can change them. **Missing:** an Accounts role, void and credit notes, receipts and tax deducted at source, PO consumption, the invoice document. |
| Interviewer panel | Review submissions, see scheduled interviews, share available slots | *none* | `Missing` | Panel members are typed names. An account link is reserved for them (M31, deferred). Nothing exists for slots, a personal schedule or submission review. |
| Resource Manager | Candidate skill metrics, utilisation management, monthly account and candidate reviews | *none (Admin)* | `Partial` | **Exists:** utilisation (Resources, Deployments, Dashboard), for Admin only. **Missing:** a skill matrix with proficiency, monthly reviews, bench ageing, a role. |
| Resources (deployed) | Timesheet submission | *none* | `Missing` | Deployed people have no login. Working days and leave are typed by the biller onto each invoice line (FSD-12). |
| Admin | Operations, overrides | Admin | `Covered` | **Exists:** full access. **Missing:** account management in the app (command-line only), and explicit override actions with a reason and an audit trail, for example reopening a collected invoice or forcing an allocation. |
| Management | View access, custom reports | Management | `Covered` `reports missing` | **Exists:** read-only access everywhere, and the Dashboard. **Missing:** reports of any kind. The application has no export, no trend over time and no report builder. |

## 3. Journey

Campaign for outreach → prospect → meetings → leads → requirements → qualification → candidate mapping → interviews → agreement → deployment. The table below adds timesheets and invoicing, the step that follows deployment and closes the loop financially.

| # | Stage | Owner | Coverage | Where / gap |
|---|---|---|---|---|
| 1 | Campaign for outreach | Leadgen | `Missing` | No module. Proposed **FSD-14**. |
| 2 | Prospect | Leadgen | `Partial` | Prospect records exist (FSD-02), with company, contact and notes. There is no status, owner, list or page, and none can be created on its own. Proposed **FSD-15**. |
| 3 | Meetings | Leadgen, Sales | `Missing` | The nearest equivalents are a requirement's next step and follow-up comments. Proposed **FSD-15**. |
| 4 | Leads | Leadgen → Sales | `Missing` | No lead record exists. Today a requirement at the Requirement stage stands in for a lead, so a company's interest cannot be recorded before a specific role exists. Proposed **FSD-15**. |
| 5 | Requirements | Leadgen, Sales | `Covered` | FSD-02, including batch entry and the three owners. |
| 6 | Qualification | Leadgen, Sales | `Partial` | It exists as a stage, with no qualification criteria behind it. A requirement can move on with nothing checked. |
| 7 | Candidate mapping | TA | `Covered` | FSD-03. |
| 8 | Interviews | TA, Interviewer | `Partial` | TA logs rounds, panel and feedback (FSD-03). The interviewer side is missing: slots, own schedule, submission review. Proposed **FSD-16**. |
| 9 | Agreement | Sales → Accounts | `Partial` | It is both a pipeline stage (FSD-02) and a module (FSD-11), but the two are not linked. A PO can only be recorded after the requirement becomes a project, so the stage has no document behind it. |
| 10 | Deployment | Admin, Resource Manager | `Covered` | Convert to Project and Deployments (FSD-02, FSD-10). |
| + | Timesheets → invoice | Resource → Accounts | `Built` | **FSD-18** (M65), awaiting release. Approved timesheets supply an invoice line's paid and unpaid leave when every working day of the period is approved; working days stay as the contract states them. |

## 4. Proposed new modules

Scope outlines only. Each one becomes a full FSD and a module plan for approval before any build.

| FSD | Module | For | Outline |
|---|---|---|---|
| FSD-14 | Campaigns & Outreach | Leadgen | Campaigns with a target segment and channel (calls, email, LinkedIn, events). Target lists of companies and contacts. An activity log for every call, email and message with its outcome. Conversion of a positive response into a prospect. Campaign results: reached, responded, meetings, leads. |
| FSD-15 | Prospects, Meetings & Leads | Leadgen, Sales | A prospect list with status (new, contacted, meeting set, qualified, converted, dead) and an owner. Meetings with date, attendees, notes, outcome and next step. **Convert a prospect into a lead** (D4): a lead record that keeps its link to the prospect and goes on to produce one or more requirements. Existing clients can raise leads directly. Qualification criteria (for example budget, authority, need, timeline) checked before moving on. |
| FSD-16 | Interviewer Portal | Interviewer panel | An **Interviewer** role (M31) for **internal and external** interviewers (D5). External accounts are invited, set to expire, and limited to their assigned rounds. Interviewers publish available slots that TA books rounds into, see their own schedule, review the submitted profile and JD, and enter feedback, scores and questions asked. Nothing commercial, and no browsing the pool. Candidate contact details are hidden unless granted (section 7). |
| FSD-17 | Resource Management | Resource Manager | A **Resource Manager** role. A skill matrix with proficiency per resource and per candidate, shared with the rating criteria. Utilisation planning, bench ageing and roll-offs. **Monthly reviews**: an account review per client and a performance review per deployed resource, submitted, approved and kept. |
| FSD-18 | Timesheets & Resource Self-Service — **built as M65, see [FSD-18](../plans/mxxwork/m65work/FSD-18-timesheets.md)** | Resources, Resource Manager, Accounts | A **Resource** role with a narrow self-service login (D1). **Day-wise** entries per deployment: worked, paid leave, unpaid leave, holiday (D3). **The Resource Manager approves** (D2), daily, weekly or monthly, at a cadence set per resource or client. The approved days in an invoice period pre-fill that invoice's lines (FSD-12) and keep a leave register (FS-RES-05). |
| FSD-19 | Reports | Management, all heads | **Phase 1, a fixed set** (D7): pipeline funnel and conversion by period, source effectiveness, utilisation trend, billing and margin trend, receivables ageing, recruiter and leadgen productivity. Each with filters and CSV export. **Phase 2, a report builder.** |
| FSD-20 | Accounting Sync (Tally) | Accounts | Added by D6. TallyPrime, through a separate **bridge application** on the Tally machine that reads and writes Tally locally and connects to this app. **Phase 1 is Tally → app**: ledgers, sales vouchers, receipts and outstanding bills, with mapping, a sync log and reconciliation. Phase 2 writes back to Tally, with approval. See FSD-00A §2 and G-TLY. |

### Changes to issued FSDs

- **FSD-01 Platform**: four new roles (Accounts, Interviewer, Resource Manager, Resource), with external interviewer accounts that expire, making a major version (v4.0). Also: in-app account management and self-service password reset (D1), **access requests with time-limited, audited grants** (section 7), and Admin overrides with a reason and an audit trail.
- **FSD-08 Clients / FSD-10 Deployments**: read access for Sales to their clients' accounts, projects and people deployed, with every cost field hidden (D8).
- **FSD-11 / FSD-12**: move write access from Admin to the Accounts role, which also sees margin and CTC (D6). Link the Agreement pipeline stage to an agreement record. Void and credit notes (FS-INV-02). Tally sync status on each invoice (FSD-20).
- **FSD-02 Pipeline**: requirements created from a lead, which is converted from a prospect (D4). Qualification criteria.

## 5. Recommended order

Follow where money and risk sit, not the order of the journey. Each step leaves the application usable.

| Step | What | Why this position |
|---|---|---|
| 0 | Close the high-priority findings in the register | Access gaps and wrong KPI notes undermine trust in everything built on top. The pipeline access fix is already running as its own task. |
| 1 | Roles foundation: FSD-01 v4.0 | The four new roles, in-app accounts and password reset, and **access requests** (section 7). Everything below depends on them. External interviewers and resource logins must not go live before this. |
| 2 | Accounts role on Agreements and Invoices | Small, because the modules exist. It takes billing work off Admin straight away. |
| 2b | FSD-20 Tally sync, phase 1 (inbound) | Follows the Accounts role, which owns it. Reading only keeps the risk low. The bridge application is built alongside it. |
| 3 | FSD-18 Timesheets | The largest gain in billing accuracy. It removes hand-typed leave, the reason M57 and M59 were needed. |
| 4 | FSD-16 Interviewer Portal | Closes the interview stage. The schema for it was reserved in M29. |
| 5 | FSD-15 Prospects, Meetings & Leads | Builds the front of the funnel on the prospect records that exist. |
| 6 | FSD-14 Campaigns & Outreach | Feeds FSD-15, so it comes after it. |
| 7 | FSD-17 Resource Management | Needs timesheets and roles to review against. |
| 8 | FSD-19 Reports | Most useful once the new modules produce data. Simple CSV export can come earlier. |

## 6. Decisions

All eight were answered by the Product Owner on 27 Sep 2026. Where an answer differs from the proposed default, the consequence is spelled out.

| # | Question | Decision | What it changes |
|---|---|---|---|
| D1 | Do deployed resources get their own login? | Yes | About 60 more accounts. The command-line account tool no longer scales, so in-app account management (FS-PLT-05) and self-service password reset (FS-PLT-06) become part of the roles foundation. |
| D2 | Who approves a timesheet? | Resource Manager | As proposed. Client sign-off is not part of the app's approval. |
| D3 | Is a timesheet by the day or by the month? | Day-wise entries, approved daily, weekly or monthly | Differs from the monthly default. A resource records each day (worked, paid leave, unpaid leave, holiday), and the approval cadence is a setting. An invoice period totals the approved days inside it. |
| D4 | Is a lead its own record, or a status on a prospect? | A prospect is converted into a lead | A lead is its own record, created by converting a prospect. It keeps a link back to the prospect and goes on to produce requirements. |
| D5 | Are interviewers internal only? | No. External interviewers get access too | Differs from the default, and raises the security bar. External accounts must be invited, limited to their assigned rounds, and set to expire. They see only the candidate details a round needs. This depends on the principle in section 7. |
| D6 | Does the Accounts role see margin and salary? | Yes, and it monitors syncing with Tally | Differs from the default. Accounts sees margin and CTC. A new module is added, **FSD-20 Accounting Sync (Tally)**, covering what has been pushed to Tally, what failed, and reconciliation. |
| D7 | Custom reports: fixed set with export, or a builder? | Fixed reports first, a builder later | As proposed. The builder is recorded as FSD-19 phase 2. |
| D8 | Can Sales see what is deployed at their clients? | Yes, with costs hidden | As proposed. Sales sees projects, people deployed and billing, but not CTC, commission, overhead or margin. |
| D9 | Do timesheets record hours or day types, and how do hours become invoice billed-days? | Both. Hours and tasks are the client-facing record; a day type is derived for billing. A full day is defined in hours per deployment, 8 by default, so `days = hours ÷ full-day hours` | Extends D3 rather than replacing it. Without the conversion rule, timesheets cannot feed invoice lines (G-RES-04), which FSD-00 calls the largest gain in billing accuracy. |
| D10 | Is the timesheet version set per user, per project, or per deployment? | Per deployment, with a project-level default | A deployment already is resource × project, so the conflict for a resource on two differently-set projects dissolves instead of needing a precedence rule. Admin sets it. |
| D11 | In version 2, is "hourly updates" one entry per clock hour or task entries with durations? | Task entries with durations, summing to the day | One table serves both versions: version 1 is the one-row-per-day case. Per-clock-hour would force 8+ rows a day and a second table. |
| D12 | Is lead temperature (cold/warm/hot) separate from the funnel stage? | Two fields | Stage is where the lead is, temperature is how likely it is. Collapsing them loses "qualified but cold". The leadgen board columns are stages; temperature is a marker on the card. |
| D13 | Who enters client feedback on a resource? | The Account Manager records it on the client's behalf. A client login is a later module | A client login needs the invited, expiring, scoped-access pattern from D5 and screens nobody has designed. Recorded as a Good-to-have gap. |
| D14 | Are outbound Tally writes in scope now, reversing G-TLY-08? | Yes, with an explicit approval gate: Accounts reviews a queued posting and releases it. Nothing posts automatically | Reverses "read-only in phase 1". G-TLY-08 is superseded and G-TLY-09 is promoted to Must. The Product Owner's instruction that delete and deactivate are never allowed becomes an allowlist of permitted actions in the bridge, so no delete path exists to disable. |
| D15 | Is a proforma a document the app owns, or only a Tally artefact? | App-owned, as a pre-invoice state ahead of Raised | Keeps the invoice lifecycle forward-only, which is enforced server-side and returns 409 on backward moves. New gap G-ACC-10. |
| D16 | Which Tally expense groups are pulled, and what for? | Direct and Indirect Expenses, for reporting first | Feeding margin means reconciling against CTC estimates, which is G-TLY-11 and stays separate. New gap G-TLY-18. |

## 7. Principle: sensitive by default, access on request

Set by the Product Owner on 27 Sep 2026, for the future. It applies to every module, new and existing.

- **Sensitive fields are hidden unless a role needs them for its job.** Sensitive means salary and CTC, margin, cost lines, client budgets and deal value, and candidates' personal contact details and resumes.
- **Anyone can request access** to a hidden field or record from the screen where it is hidden. They state a reason, and the request goes to Admin, or to the head who owns that data.
- **Grants are narrow and time-limited**: a named record or field, for a set period, removed automatically when it ends.
- **Everything is recorded**: who asked, who approved, what was seen and until when.
- **Hiding stays on the server.** A hidden value is never sent to the browser, which is the rule FR-PLT-014 already follows. A grant changes what the server sends, not what the screen displays.

This turns the role table from fixed walls into a default with an audited way through. It needs to be designed once, in the roles foundation, before external interviewers (D5) or resource logins (D1) go live.

## Revision history

| Rev | Date | Change |
|---|---|---|
| 1.0 | 27 Sep 2026 | First issue. Checks FSD-01 to FSD-13 against the stated aim, nine departments and the journey. |
| 1.1 | 27 Sep 2026 | D1–D8 settled. Added the principle of sensitive by default, with access on request. Added FSD-20 Tally sync. Module outlines and build order updated to match. |
| 1.2 | 21 Oct 2026 | **D9–D16 settled**, scoping the Product Owner's four features of 21 Oct into modules M62–M67. Timesheets extend D3 with hours and tasks and gain a per-deployment version setting (D9–D11). Lead temperature joins the funnel stage as a second field (D12). Client feedback is recorded by the Account Manager, not the client (D13). **Outbound Tally writes are in scope, reversing G-TLY-08** (D14). Proforma becomes an app-owned pre-invoice state (D15), and Direct and Indirect Expenses join the inbound sync (D16). See `docs/plans/2026-10-21-scope-m62-m67-four-modules.md`. |
| 1.3 | 22 Oct 2026 | FSD-18 built as M65 (awaiting release): the Timesheets → invoice journey row moves from Missing to Built. Leave balances and the leave register (G-RES-05) remain future scope. |
