# Functional specifications, one per module

> Source of truth for the module FSDs. The shared web copy (https://claude.ai/artifact/X1aigvJXqU4CopKdMQvQNr) is republished from these files. Every implementation plan ends by updating the FSDs it touches.

`FSD Register · Rev 1.1`

Each document below describes one module of the Resource Deployment Management System: what is live in production today, the rules it applies, and what is planned next. They describe the application as it runs at commit `5e43f82` on 27 September 2026.

| Field | Value |
|---|---|
| Product | Resource Deployment Mgmt System |
| Baseline release | 1.0.0 (proposed) |
| Baseline commit | 5e43f82 |
| Baseline date | 27 Sep 2026 |
| Production | Vercel · main branch |
| Testing | Vercel · develop branch |
| Document owner | Product Owner |
| Source of truth | Code, then Module Plan |

## 1. Document register

Documents are issued in order. FSD-00 checks the whole set against the platform aim. FSD-01 to FSD-13 describe what is live. FSD-14 to FSD-20 are `Proposed`: they have a number and an outline in FSD-00, and become full documents once approved.

| No. | Module | Code | Module ver. | Doc rev. | Status | Plan modules |
|---|---|---|---|---|---|---|
| FSD-00 | [Platform Vision & Coverage](FSD-00-platform-vision-coverage.md) | VIS | — | Rev 1.1 | `Issued` | — |
| FSD-00A | [Feature Gap Register](FSD-00A-feature-gap-register.md) | GAP | — | Rev 1.3 | `Issued` | — |
| FSD-01 | [Platform, Roles & Access](FSD-01-platform-roles-access.md) | PLT | v4.2 (built; v3.1 live) | Rev 2.2 | `Issued` | M0 · M10 · M21 · M37 · M41 · M47 · M49 · Accounts & sign-in |
| FSD-02 | [Staffing Pipeline](FSD-02-staffing-pipeline.md) | PIP | v4.1 (built; v4.0 live) | Rev 1.1 | `Issued` | M8 M12 M13 M17 M18 M42 M46 M48 M52–M56 M66 |
| FSD-03 | [Candidates & Interviews](FSD-03-candidates-interviews.md) | CAN | v3.1 | Rev 1.0 | `Issued` | M9 M22 M26–M29 M32–M36 |
| FSD-04 | [Job Board & Referrals](FSD-04-job-board-referrals.md) | JOB | v3.0 | Rev 1.0 | `Issued` | M13 M16 M23 M24 |
| FSD-05 | [Role Workspaces](FSD-05-role-workspaces.md) | WRK | v2.2 (built; v2.1 live) | Rev 1.1 | `Issued` | M25 M27 M30 M38 M43–M45 M66 |
| FSD-06 | [AI Agents](FSD-06-ai-agents.md) | AGT | v3.1 | Rev 1.0 | `Issued` | M19 M20 M28 |
| FSD-07 | [Resources](FSD-07-resources.md) | RES | v1.3 | Rev 1.0 | `Issued` | M1 M15 M39 |
| FSD-08 | [Clients](FSD-08-clients.md) | CLI | v1.4 (built; v1.3 live) | Rev 1.1 | `Issued` | M2 M14 M15 M46 M66 |
| FSD-09 | [Projects](FSD-09-projects.md) | PRJ | v1.4 (built; v1.3 live) | Rev 1.1 | `Issued` | M3 M14 M15 M47 M65 |
| FSD-10 | [Deployments](FSD-10-deployments.md) | DEP | v2.3 (built; v2.2 live) | Rev 1.1 | `Issued` | M4 M14 M15 M40 M58 M65 |
| FSD-11 | [Agreements & POs](FSD-11-agreements-pos.md) | AGR | v1.5 | Rev 1.0 | `Issued` | M6 M11 M14 M15 |
| FSD-12 | [Invoices](FSD-12-invoices.md) | INV | v2.2 (built; v2.1 live) | Rev 1.1 | `Issued` | M7 M14 M15 M57 M59 M65 |
| FSD-13 | [Dashboard & KPIs](FSD-13-dashboard-kpis.md) | DSH | v2.1 | Rev 1.0 | `Issued` | M5 M18 M30 M40 M55 |
| FSD-14 | [Campaigns & Outreach](../plans/mxxwork/m66work/FSD-14-campaigns-outreach.md) | CMP | v1.0 (built, not released) | Rev 1.0 | `Built` | M66 |
| FSD-15 | [Prospects, Meetings & Leads](../plans/mxxwork/m66work/FSD-15-prospects-meetings-leads.md) | LED | v1.0 (built, not released) | Rev 1.0 | `Built` | M66 |
| FSD-16 | Interviewer Portal | INT | — | — | `Proposed` | M31 · see FSD-00 |
| FSD-17 | Resource Management | RMG | — | — | `Proposed` | see FSD-00 |
| FSD-18 | [Timesheets & Self-Service](../plans/mxxwork/m65work/FSD-18-timesheets.md) | TSH | v1.0 (built, not released) | Rev 1.0 | `Built` | M65 |
| FSD-19 | Reports | RPT | — | — | `Proposed` | see FSD-00 |
| FSD-20 | Accounting Sync (Tally) | TLY | — | — | `Proposed` | D6 · see FSD-00 |

## 2. Versioning

Three numbers are tracked, and each answers a different question. The release says which build is running. The module version says how far one module has moved. The document revision says which edition of its FSD you are reading.

### Product release — `release-1.0.0`

A git tag on `main`. The build workflow already produces images from `release-*` tags.

- **Major**: a change that alters what existing records mean, or that users must be retrained on.
- **Minor**: a group of modules shipped together (usually one phase of the plan).
- **Patch**: fixes only, no change in behaviour.

### Module version — `v2.1`

Carried by each FSD and bumped only when that module ships.

- **Major**: a business rule changes an outcome people already rely on, such as a billed amount, a margin, or who can see what.
- **Minor**: new capability that leaves existing outcomes unchanged.
- Fixes and wording changes do not bump it.

### Document revision — `Rev 1.0`

The edition of one FSD. Each document keeps its own revision history.

- **+1.0** when the module's major version changes.
- **+0.1** for a new minor version, a correction, or future scope being added or re-ranked.

### Identifiers

| Form | Meaning | Rule |
|---|---|---|
| FR-INV-012 | Functional requirement | Module code plus a number. Never reused or renumbered. A retired requirement stays in the table, marked Retired. |
| BR-INV-03 | Business rule or calculation | A rule the system enforces, stated once and referenced from the requirements that depend on it. |
| FS-INV-04 | Future scope item | When it ships it becomes an FR, and the FR records which FS item it came from. |
| M57 | Plan module | The delivery unit in the Module Plan. Every version entry cites the plan modules and the commit behind it, so each point traces back to its build. |

### Status values

- `Live` in production now
- `Built` merged and verified, awaiting the production migration or deploy; becomes `Live` when released
- `Planned` agreed, not yet built
- `Proposed` suggested, needs a decision
- `Deferred` logged, deliberately not scheduled
- `Retired` removed, kept for history

> **Baseline release.** No release tag exists yet: production on Vercel deploys whatever is on `main`. These FSDs propose tagging `5e43f82` as `release-1.0.0`, so the documents and a tag describe the same build. From then on, a release tag is cut each time `main` moves, and each FSD records the release its module version first shipped in.

## 3. How each FSD is laid out

| Section | What it holds |
|---|---|
| Document control | Module code and version, revision, status, baseline commit, where the module appears in the app. |
| 1 · Purpose and scope | What the module is for, and what it deliberately leaves to other modules. |
| 2 · Users and access | Which roles can view or change what, including row-level limits. |
| 3 · Deployed functionality | Every live requirement, grouped by screen or capability, with the version it arrived in. |
| 4 · Business rules | Calculations, validations and state rules, with worked formulas where money is involved. |
| 5 · Data | What the module stores, in business terms, with the table names for reference. |
| 6 · Interfaces | What this module reads from and feeds into other modules. |
| 7 · Version history | Each module version with date, plan modules and commit. |
| 8 · Future scope | Planned, proposed and deferred items, each with its source and priority. |
| 9 · Known limitations | Behaviour that is intended but worth knowing, and open questions. |
| Revision history | Editions of this document. |

## 4. Roles referenced throughout

Five roles are live. A **head** is a flag on a TA, Lead Generation or Sales account that widens what they can see across their team. It is not a separate role. FSD-01 defines these in full. FSD-01 v4.0 adds four more (Accounts, Resource Manager, Interviewer and Resource), which see only a holding page until their modules are specified.

| Role | In short | Lands on |
|---|---|---|
| Admin | Full access to every module. | Dashboard |
| Management | Sees everything Admin sees. Cannot change anything. | Dashboard |
| TA Team | Fulfils requirements: candidates, interviews, applicants, agents. Never sees client-facing money. | My Work |
| Lead Generation | Brings in requirements and takes their own as far as budgeting. | My Leads |
| Sales | Owns requirements from budgeting to won or lost, with commercial figures. | My Deals |

## 5. Issues found while writing

Every FSD was written against the code, not against earlier documents. That turned up the gaps below, where the application does not do what was decided or what its own screens say. Each is filed as a future-scope item in its module. None has been changed yet.

| Item | What is wrong | Kind | Priority |
|---|---|---|---|
| FS-PIP-01 | Lead Generation receives deal value and sees value KPIs on the pipeline screen. | Access | High |
| FS-PIP-02 | The server accepts deletion of any requirement from Lead Generation and Sales, without an ownership check. | Access | High |
| FS-WRK-01 | Sales *In flight* is labelled stage-weighted but is not weighted, and includes Budgeting and On Hold. | KPI | High |
| FS-DSH-01 | Monthly Billing and Commission notes claim allocation pro-rating that is not applied. | KPI note | High |
| FS-AGT-01 | Resume text from DOCX, text files and pasted input is kept in agent run records with no end date. | Privacy | High |
| FS-INV-02 | Collected invoices point to a "void and re-raise" action that does not exist. | Gap | High |
| FS-DEP-01 | Deployments past their end date stay active and keep their allocation. | Gap | High |
| FS-DSH-02 | "Filled" means different things on the Dashboard and the Pipeline screen. | KPI | Medium |
| FS-WRK-02 | Won deals already converted still show as awaiting conversion on My Deals. | Defect | Medium |
| FS-PIP-04 | Converting a prospect's won requirement leaves the prospect unmarked. | Defect | Medium |
| FS-JOB-01 | The step to confirm which employee referred an applicant (M23) was never built. | Not built | Medium |
| FS-AGT-02 | Attaching a resume validation to a requirement (M20) was never built. | Not built | Medium |
| FS-PLT-04 | Disabling an account or changing its role takes effect only at the next sign-in, up to 12 hours later. **Built** in FSD-01 v4.0, awaiting release. | Access | Medium |
