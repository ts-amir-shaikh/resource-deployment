# Platform, Roles & Access

`FSD-01 · PLT`

Sign-in, accounts, the five roles, what each role may see and change, and the shared pieces every other module stands on: navigation, searchable pickers, and the health check operations use to confirm which build is live.

| Field | Value |
|---|---|
| Module code | PLT |
| Module version | v3.1 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Login page, sidebar |
| Plan modules | M0 M10 M21 M37 M41 M47 M49 |
| Owner | Product Owner |

## 1. Purpose and scope

This module decides who is signed in and what they are allowed to do. Every other module relies on it: a screen or an API call is checked against the rules here before any of that module's own logic runs.

### In scope

- Sign-in, sessions and sign-out.
- User accounts, the five roles and the head flag.
- The access policy: which areas each role may open, and which changes each role may make.
- Row-level ownership rules for requirements (whose requirement it is, and which stages that person may move it to).
- Withholding commercial figures from roles that must not see them.
- Recording who did what, taken from the session.
- The public surface: which pages work without signing in, and what search engines may index.
- Navigation, the collapsible sidebar, and the searchable picker used across all forms.
- Health check, web analytics, environments and schema-change practice.

### Out of scope

- What each module shows once access is granted. That is in the module's own FSD.
- The personal dashboards (My Work, My Leads, My Deals). See FSD-05.
- Server set-up and the move to AWS. The DevOps runbook covers those.

## 2. Users and access

The access matrix below is the policy as enforced. The same table drives the sidebar, so nobody is offered a link that would then be refused.

| Area | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| Dashboard | Full | View | — | — | — |
| My Work / My Leads / My Deals | — | — | My Work | My Leads | My Deals |
| Staffing Pipeline | Full | View | Fulfil | Own, to budgeting | All, budgeting on |
| Candidates & applicants | Full | View | Full | — | Full |
| Agents | Run | Read runs | Run | — | Run |
| Resources · Clients · Projects | Full | View | — | — | — |
| Deployments · Agreements · Invoices | Full | View | — | — | — |
| Public job board, share links | Open to anyone, no sign-in |  |  |  |  |

**Fulfil** means TA can map candidates, log interviews and feedback, comment, and move stages, but cannot create a requirement, edit its details, convert a won deal to a project, or onboard a prospect as a client. The pipeline limits for Lead Generation and Sales are set out in BR-PLT-04 and BR-PLT-05.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Sign-in and sessions** | | | |
| FR-PLT-001 | Users sign in with a username and password. Usernames are not case-sensitive. — A wrong username and a wrong password get the same message, "Incorrect username or password", and take the same time to reject. That stops anyone learning which usernames exist. | v2.0 | `Live` |
| FR-PLT-002 | A successful sign-in starts a session that lasts 12 hours. After that the user is asked to sign in again. | v2.0 | `Live` |
| FR-PLT-003 | After sign-in, the user returns to the page they were trying to open. If there was none, they land on their role's home page (Dashboard, My Work, My Leads or My Deals). | v3.0 | `Live` |
| FR-PLT-004 | Sign out ends the session in that browser immediately. | v2.0 | `Live` |
| FR-PLT-005 | While no active account exists, a single shared password signs in as Admin. That path closes by itself the moment the first account is created. — Kept so a fresh installation can be reached. It is not a standing back door. | v2.0 | `Live` |
| **Accounts** | | | |
| FR-PLT-006 | An operator manages accounts with a command-line tool: create, list, reset password, change role, disable or re-enable, and grant or revoke the head flag. | v2.0 | `Live` |
| FR-PLT-007 | Passwords are typed at a masked prompt, entered twice, and must be at least 10 characters. They are never passed on the command line, where they would end up in shell history. | v2.0 | `Live` |
| FR-PLT-008 | A disabled account cannot sign in, and it no longer appears in owner and assignee pickers. | v2.0 | `Live` |
| **Roles and enforcement** | | | |
| FR-PLT-009 | Every account has one of five roles: Admin, Management, TA Team, Lead Generation or Sales. | v3.0 | `Live` |
| FR-PLT-010 | A TA, Lead Generation or Sales account can carry the head flag. A head sees their whole team's work and can pick any team member's board to view. | v3.0 | `Live` |
| FR-PLT-011 | Every page and every API request is checked against the access policy before the module's own code runs. — A page the role may not open redirects to the user's own home page. A refused API call returns a plain message, for example "Management access is view-only." | v2.0 | `Live` |
| FR-PLT-012 | Management can open everything Admin can, and every change they attempt is refused. | v2.0 | `Live` |
| FR-PLT-013 | Row-level rules decide whose requirement it is and which stages that person may move it to. Screens hide actions the server would refuse, so nobody is offered a button that fails. | v3.0 | `Live` |
| FR-PLT-014 | Commercial figures are removed on the server before a response leaves it, not hidden on screen. TA never receives client budget or deal value. Lead Generation is meant not to receive deal value. That holds on the requirement page but not on the pipeline screen (see section 9). | v2.0 | `Live` |
| FR-PLT-015 | The author of comments, stage moves, candidate mappings, call logs and approvals is recorded from the signed-in account. Nobody types their own name. | v2.1 | `Live` |
| **Public surface** | | | |
| FR-PLT-016 | These work without signing in: the login page, the public job board and its apply form, stakeholder share links, and the health check. Everything else requires a session. | v2.0 | `Live` |
| FR-PLT-017 | Search engines may index the job board only. Share links, the API and the login page are excluded. | v2.0 | `Live` |
| **Navigation and shared controls** | | | |
| FR-PLT-018 | The sidebar lists only the areas the user's role may open, and shows their name and role above Sign out. | v2.0 | `Live` |
| FR-PLT-019 | The sidebar stays fixed to the screen height, so Sign out is always in the same place. It collapses to an icon rail with tooltips, and the choice is remembered in that browser from the first page load. | v2.4 | `Live` |
| FR-PLT-020 | The Candidates link carries a count of new applicants for the user's requirements. | v2.3 | `Live` |
| FR-PLT-021 | Every picker that lists records (resources, projects, clients and prospects, agreements, candidates, requirements) is searchable. Type to filter on every word, use the arrow keys and Enter to choose, Escape to close, and × to clear. Options can show a second line and group headings. — Fixed lists such as currency, stage or work mode stay ordinary dropdowns, because typing is slower than picking from six known values. | v3.1 | `Live` |
| **Operations** | | | |
| FR-PLT-022 | A health check at `/api/health` reports whether the app is up, which commit it is running, and whether it can reach the database. It returns an error status when the database is unreachable, and reveals nothing else. | v2.5 | `Live` |
| FR-PLT-023 | Page views are counted with Vercel Web Analytics. | v2.3 | `Live` |
| FR-PLT-024 | The application is packaged as a container image, so it can run on any server as well as on Vercel. | v2.5 | `Live` |

## 4. Business rules

### BR-PLT-01 · Password storage

A password is never stored. What is stored is a PBKDF2-SHA256 hash (210,000 iterations) with a random salt for each user. The check runs in constant time.

### BR-PLT-02 · Session token

The session is a signed token in a cookie that page scripts cannot read. It is sent over HTTPS only in production and expires after 12 hours. It carries the user's id, name and role. A token naming an unknown role is rejected outright.

### BR-PLT-03 · Write rules: the first match wins

For TA, Lead Generation and Sales, each attempted change is tested against an ordered list of rules, and the first rule that matches decides. Narrow refusals sit above broad permissions. For example, TA may change anything under a requirement except converting it to a project or onboarding it as a client, and those two refusals come first. If no rule matches, the change is refused.

### BR-PLT-04 · Lead Generation limits

A Lead Generation user sees and edits the requirements where they are lead owner. They can move those between Requirement, Qualification and Budgeting, or to Lost or Hold. Once a requirement is past Budgeting it is read-only to them, because handing it over is done by setting a sales owner. A head also has every team member's requirements and any with no lead owner.

### BR-PLT-05 · Sales limits

Sales sees the whole pipeline with commercial figures. On requirements where they are sales owner (or, for a head, where anyone on the team is, or nobody is), they can edit and move through Budgeting, Candidate Mapping, Interview and Agreement to Won, Lost or Hold, and onboard a prospect as a client. Converting a won requirement into a project is Admin-only.

### BR-PLT-06 · Who may set owners

Admin sets the lead owner, sales owner and TA assignees. A head may set their own kind of owner within their team. Nobody else may, so a member cannot hand their own requirement to someone else.

### BR-PLT-07 · Additive schema changes

Database changes only ever add. A column is never dropped, even when it is retired, so older records keep their meaning. Every migration can be re-run safely, and it runs before the code that depends on it is deployed.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| User account | users | Name, username (unique), password hash and salt, role, head flag, active flag, and when the user last opened the applicant queue. Created and updated timestamps. |
| Sidebar preference | cookie | Whether the sidebar is collapsed, in that browser only. |
| Session | cookie | The signed token described in BR-PLT-02. Nothing about the session is stored on the server. |

## 6. Interfaces

- **Every module** is gated by the access policy, and most record their actor through this module.
- **Staffing Pipeline (FSD-02)** uses the ownership rules, the owner pickers and the commercial-figure removal.
- **Candidates (FSD-03)** supplies the new-applicant count shown on the sidebar.
- **Job Board (FSD-04)** is the main public surface this module opens up.
- **Operations**: the deploy script and the reverse proxy call the health check. Deploys are confirmed by matching its commit to `main`.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M0  
  App shell, sidebar navigation and one shared password for everyone.
- **v2.0** (major) · 7 Sep 2026 · cf2805b · M10  
  Named accounts and three roles (Admin, Management, TA). Access policy enforced on every request. Hashed passwords, and client budget withheld from TA.
- **v2.1** · 8 Sep 2026 · 854d4a7 · M21  
  Actors recorded from the session on comments, stage moves, mappings and decisions.
- **v2.2** · 9 Sep 2026 · 2a3b864 · M25  
  Team-lead flag, granted and revoked through the account tool.
- **v2.3** · 10 Sep 2026 · b13a9a3 · 7166e56 · M27  
  Vercel Web Analytics, and the new-applicant count on the Candidates link.
- **v2.4** · 13 Sep 2026 · 90ab7fc · M37  
  Fixed-height, collapsible sidebar.
- **v2.5** · 15 Sep 2026 · e5a1a5a · M49  
  Container packaging and the health check that reports the running commit.
- **v3.0** (major) · 17 Sep 2026 · 3baa593 · M41 M42 M44 M45  
  Five roles, with the head flag extended to Lead Generation and Sales. Row-level ownership rules, and three owners per requirement.
- **v3.1** · 24 Sep 2026 · 686d99f · M47 — **current**  
  Searchable pickers across every form that lists records. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-PLT-01 | Move production to AWS — Production moves to the Lightsail server at staffing.techstalwarts.com, and Vercel becomes the testing environment with its own database and secrets. The server is already live. The date is held by the Product Owner. | Plan M51 | High | `Planned` |
| FS-PLT-02 | Scheduled backups of the AWS database file — The backup script in the repository points at the original database layout and needs repointing to the SQLite file. Until it runs on a schedule, recovery depends on Lightsail snapshots. | Plan M50 | High, before FS-PLT-01 | `Planned` |
| FS-PLT-03 | Tag releases — Tag `5e43f82` as `release-1.0.0`, then cut a tag each time `main` moves, following the Register's versioning rules. | This FSD set | Medium | `Proposed` |
| FS-PLT-04 | End sessions when an account is disabled or its role changes — Checking the account's active flag and role on each request would make both take effect immediately. See the limitation in section 9. | This review | Medium | `Proposed` |
| FS-PLT-05 | Account management screen for Admin — Create, disable, reset and change role in the app, replacing the command-line tool for everyday use. | This review | Medium | `Proposed` |
| FS-PLT-06 | Users change their own password | This review | Medium | `Proposed` |
| FS-PLT-07 | Lock out repeated failed sign-ins — Today each failure is only slowed by 0.4 seconds. | This review | Low | `Proposed` |
| FS-PLT-08 | Interviewer role — A sixth role limited to the interviewer's own scheduled rounds, with the candidate and JD for each. The account link on panel members is already reserved for it. | Plan M31 | Later | `Deferred` |
| FS-PLT-09 | Email sending — No mail provider is configured. Interviewer access and any digest or alert email depend on choosing one. | Plan P9 | Later | `Deferred` |
| FS-PLT-10 | Named sub-teams — Heads currently oversee everyone in their role. Named teams would need a new record and would change how every dashboard is scoped. | Plan P10 | Only if needed | `Deferred` |
| FS-PLT-11 | Credential hygiene — Rotate the Turso token that was once printed to a transcript. Move the GitHub token out of the git remote URL and into a credential helper. | Plan, Deployment Status | High | `Planned` |
| FS-PLT-12 | Write the production and testing URLs in the README — Confirming a deploy then takes one command instead of knowing the Vercel hostname. | Plan, Deployment Status | Low | `Planned` |

## 9. Known limitations

- **Disabling an account does not sign it out.** A session already open keeps working until its 12 hours are up, because the session is checked by signature and not against the database. A role change likewise takes effect at the next sign-in. The head flag is the exception: it is read fresh on every request. FS-PLT-04 would close this.
- **Two access gaps in the pipeline.** Lead Generation receives deal value on the pipeline screen, and the server accepts requirement deletion from Lead Generation and Sales without an ownership check. Both are set out in FSD-02, section 9, with fixes proposed as FS-PIP-01 and FS-PIP-02.
- **No self-service.** Forgotten passwords are reset by an operator with the account tool.
- **Share links are readable by anyone who has them.** That is intended. The page shows the JD and requirement only, never budgets, contacts or candidates.
- **AWS runs an older build.** The Lightsail server runs `e5a1a5a`, which predates the five roles. It holds no production data and nobody uses it until FS-PLT-01.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v3.1 | First issue, written against commit `5e43f82`. |
