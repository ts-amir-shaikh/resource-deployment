# Platform, Roles & Access

`FSD-01 · PLT`

Sign-in (email and password, or Google), accounts and the People screen, the nine roles, what each role may see and change, and the shared pieces every other module stands on: navigation, searchable pickers, and the health check operations use to confirm which build is live.

| Field | Value |
|---|---|
| Module code | PLT |
| Module version | v4.4 (v3.1 is live until v4.0 is released) |
| Doc revision | Rev 2.5 |
| Status | `Built` — v4.0 is merged and verified, awaiting the production migration and deploy |
| Baseline | 5e43f82 · 27 Sep 2026; v4.0 on `feat/accounts-sign-in` |
| Appears as | Sign-in page, Set password page, People, sidebar |
| Plan modules | M0 M10 M21 M37 M41 M47 M49 · Accounts & sign-in plan (2026-09-28) |
| Owner | Product Owner |

## 1. Purpose and scope

This module decides who is signed in and what they are allowed to do. Every other module relies on it: a screen or an API call is checked against the rules here before any of that module's own logic runs.

### In scope

- Sign-in by email and password or with Google, sessions and sign-out.
- User accounts, the People screen, the nine roles, the head flag and interviewer duty.
- Password links sent by email, and changing your own password.
- Ending a session on the next request when the account changes.
- The account log.
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
- What the Accounts, Resource Manager, Interviewer and Resource roles may open. Until their modules are specified (FSD-16 to FSD-18, and the Accounts role in FSD-11 and FSD-12), they see a holding page only.
- Access requests for hidden fields (G-PLT-05). Planned separately.

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
| People (accounts) | Full | View, no log | — | — | — |
| Change own password | Yes | Yes | Yes | Yes | Yes |
| Public job board, share links | Open to anyone, no sign-in |  |  |  |  |

The four roles added in v4.0 (Accounts, Resource Manager, Interviewer and Resource) can be assigned now. A person holding one of them who signs in sees only a page saying their access is being set up, and can change nothing (FR-PLT-036).

**Fulfil** means TA can map candidates, log interviews and feedback, comment, and move stages, but cannot create a requirement, edit its details, convert a won deal to a project, or onboard a prospect as a client. The pipeline limits for Lead Generation and Sales are set out in BR-PLT-04 and BR-PLT-05.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Sign-in and sessions** | | | |
| FR-PLT-001 | Users sign in with a username and password. Usernames are not case-sensitive. — A wrong username and a wrong password get the same message, "Incorrect username or password", and take the same time to reject. That stops anyone learning which usernames exist. | v2.0 | `Retired` in v4.0, replaced by FR-PLT-025 |
| FR-PLT-002 | A successful sign-in starts a session that lasts 12 hours. After that the user is asked to sign in again. | v2.0 | `Live` |
| FR-PLT-003 | After sign-in, the user returns to the page they were trying to open. If there was none, they land on their role's home page (Dashboard, My Work, My Leads or My Deals). | v3.0 | `Live` |
| FR-PLT-004 | Sign out ends the session in that browser immediately. | v2.0 | `Live` |
| FR-PLT-005 | While no active account exists, a single shared password signs in as Admin. That path closes by itself the moment the first account is created. — Kept so a fresh installation can be reached. It is not a standing back door. | v2.0 | `Live` |
| FR-PLT-025 | People sign in with their email address and password. The address is not case-sensitive. An older account with no email keeps signing in with its username until Admin adds one; from then on only the email works. — Every refusal (unknown address, wrong password, an account with no password, a deactivated or ended account, a placeholder address) gets the same message, "Incorrect email or password", in the same time. R12 R14 R15. | v4.0 | `Built` |
| FR-PLT-026 | **Sign in with Google.** Anyone whose Google address (Gmail or techstalwarts.com) exactly matches an account's email, and whose account can sign in, is signed in. Nothing is created or linked for an address that does not match; they are told to use the email Admin registered. — The button only appears once the Google client and the site address are configured (BR-PLT-11). R9 R13. | v4.0 | `Built` |
| **Accounts** | | | |
| FR-PLT-006 | An operator manages accounts with a command-line tool: create, list, reset password, change role, disable or re-enable, and grant or revoke the head flag. — From v4.0 the tool is the fallback; the People screen is the everyday way. It can also set an account's email (`--set-email`), and its role, head, disable and email changes take effect on the person's next request. | v2.0 | `Live` |
| FR-PLT-007 | Passwords are typed at a masked prompt, entered twice, and must be at least 10 characters. They are never passed on the command line, where they would end up in shell history. | v2.0 | `Live` |
| FR-PLT-008 | A disabled account cannot sign in, and it no longer appears in owner and assignee pickers. | v2.0 | `Live` |
| FR-PLT-029 | **People screen.** Admin adds, edits, deactivates and reactivates every login from one screen. It lists name, email (or the username an older account still signs in with), role, head and panel badges, status (Can sign in, Link sent, Access ended, Deactivated) and last sign-in, searchable by name or email and filterable by role. Management sees the same list with no controls. From FS-PLT-05. R1 R6 R22. | v4.0 | `Built` |
| FR-PLT-030 | An account holds a name, a unique email, a role, a head flag (TA, Lead Generation and Sales only), interviewer duty (internal accounts only) and an optional access-until date. A placeholder address such as `…@placeholder.local` is refused. A Resource login is tied to exactly one resource, and a resource has at most one login. An outside interviewer (the Interviewer role) must have an access-until date and cannot carry interviewer duty. — The form checks these before saving and the server checks them again (BR-PLT-13). R2–R5. | v4.0 | `Built` |
| FR-PLT-031 | Admin cannot deactivate their own account or remove their own Admin role, and the last active Admin cannot be deactivated or demoted by anyone. The refusal says why. R20. | v4.0 | `Built` |
| FR-PLT-032 | **Send link.** Admin emails an account a link to set its password: a first invite and a reset are the same action. The link works once, for 72 hours; a new link cancels any earlier unused one; an ended or deactivated account cannot use one. If sending fails, Admin sees why and the link is cancelled, so a failure never reads as sent. From FS-PLT-09. R7 R8 R17 R18. | v4.0 | `Built` |
| FR-PLT-033 | The Set password page reads the code from after `#` in the link, removes it from the address bar at once, sends no referrer to other sites, is left out of page-view analytics and is not indexed. — Decided by the Product Owner on 28 Sep 2026 (BR-PLT-09). | v4.0 | `Built` |
| FR-PLT-034 | A signed-in person changes their own password from the sidebar by entering the current one. Passwords are at least 10 characters. From FS-PLT-06. R10 R11. | v4.0 | `Built` |
| FR-PLT-035 | **Account log.** Every account creation and edit (with before and after values for name, email, role, head, interviewer duty, access-until and resource), deactivation, reactivation, link sent or failed, password set or changed, and every sign-in attempt with its method and outcome is recorded with who acted and when. Admin reads it per account from the People screen; Management cannot. R19 R22. | v4.0 | `Built` |
| **Roles and enforcement** | | | |
| FR-PLT-009 | Every account has one of five roles: Admin, Management, TA Team, Lead Generation or Sales. | v3.0 | `Retired` in v4.0, replaced by FR-PLT-036 |
| FR-PLT-036 | Every account has one of nine roles: the five above, plus Accounts, Resource Manager, Interviewer and Resource. The four new roles land on a holding page and are refused everything else until their access is defined. R23, G-PLT-01 (part). | v4.0 | `Built` |
| FR-PLT-036a | **Resource and Resource Manager leave the holding page (M65).** A Resource lands on `/timesheet` and may reach only its own timesheet routes; a Resource Manager lands on `/approvals` and may reach only the approval queue. Accounts and Interviewer still land on the holding page. Access is in `lib/access.ts`; see FSD-18 §2. | v4.1 | `Built` |
| FR-PLT-036b | **Leadgen pipeline access (M66).** Lead Generation and Sales reach Prospects, Campaigns and Leads (`/prospects`, `/campaigns`, `/lead-records`, `/api/leadgen`); Admin and Management as always. Lead Generation writes its side of the funnel but never assigns a lead's salesperson; Sales writes only handed-off leads, their assignment and activity on them. Which rows each sees is per row; see FSD-15 §2. TA and the other roles are refused. | v4.2 | `Built` |
| FR-PLT-036c | **Timesheet dashboard is Admin only (D20).** `/timesheets`, `/api/timesheets/dashboard` and `/api/timesheets/entries` are refused to Management, the Resource Manager and everyone else, by an explicit rule above the shortcut that lets Management reach every Admin path. | v4.3 | `Built` |
| FR-PLT-036d | **Leave (FSD-21).** A Resource reaches `/leaves` and `/api/leaves/mine` (its own requests); the Resource Manager and Admin decide requests through `/api/leaves/approvals`; Management reads. Rules are in `lib/access.ts`. | v4.3 | `Built` |
| FR-PLT-036e | **Reviews and skill matrix access (M67).** The Resource Manager also reaches Reviews and the Skill Matrix (`/reviews`, `/skills`, `/api/reviews`, `/api/skills`) and writes reviews and skill levels, but never approves or returns a review — Admin does. Sales reaches account reviews only (`/reviews/accounts`, `/api/reviews/accounts`), read-only and scoped per row to approved reviews of its clients. Management reads all; Resources, TA and Leadgen are refused. See FSD-17 §2. | v4.4 | `Built` |
| FR-PLT-010 | A TA, Lead Generation or Sales account can carry the head flag. A head sees their whole team's work and can pick any team member's board to view. | v3.0 | `Live` |
| FR-PLT-011 | Every page and every API request is checked against the access policy before the module's own code runs. — A page the role may not open redirects to the user's own home page. A refused API call returns a plain message, for example "Management access is view-only." | v2.0 | `Live` |
| FR-PLT-012 | Management can open everything Admin can, and every change they attempt is refused. | v2.0 | `Live` |
| FR-PLT-027 | **Changes apply on the next request.** Deactivating an account, changing its role, head flag, interviewer duty or email, or passing its access-until date takes effect on the person's next click, whichever way they signed in. A still-usable account gets a fresh session and lands where its new role belongs; an ended one is signed out. From FS-PLT-04. R16 (BR-PLT-08). | v4.0 | `Built` |
| FR-PLT-028 | Setting or changing a password signs that account out on every other device. The device where it was changed stays signed in. R21 (BR-PLT-10). | v4.0 | `Built` |
| FR-PLT-037 | After sign-in, the return address (`next`) is followed only when it stays on this site. Addresses such as `/\evil.com`, which browsers read as another site, are dropped. | v4.0 | `Built` |
| FR-PLT-013 | Row-level rules decide whose requirement it is and which stages that person may move it to. Screens hide actions the server would refuse, so nobody is offered a button that fails. | v3.0 | `Live` |
| FR-PLT-014 | Commercial figures are removed on the server before a response leaves it, not hidden on screen. TA never receives client budget or deal value. Lead Generation is meant not to receive deal value. That holds on the requirement page but not on the pipeline screen (see section 9). | v2.0 | `Live` |
| FR-PLT-015 | The author of comments, stage moves, candidate mappings, call logs and approvals is recorded from the signed-in account. Nobody types their own name. | v2.1 | `Live` |
| **Public surface** | | | |
| FR-PLT-016 | These work without signing in: the login page, the public job board and its apply form, stakeholder share links, and the health check. From v4.0 also the Set password page and its call, and the two Google sign-in steps. Everything else requires a session. | v2.0 | `Live` |
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

The session is a signed token in a cookie that page scripts cannot read. It is sent over HTTPS only in production and expires after 12 hours. It carries the user's id, name, role and, from v4.0, the account's session version and the time it was issued. A token naming an unknown role is rejected outright.

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

### BR-PLT-08 · The account check on every signed-in request

Middleware checks the token's signature, then every signed-in page and API call reads the account and decides one of three things:

- **Signed out** when the account is gone, deactivated, past its access-until date, or its sessions were revoked after this token was issued (BR-PLT-10). The cookie is cleared and the person goes to sign-in.
- **Refresh** when the account can still sign in but its role or session version differs from the token. The session is re-issued with the current values and the person continues, on their new role's home page if the old page is no longer theirs.
- **OK** otherwise.

The session version goes up on every change to role, head flag, interviewer duty, email or active state. Access-until needs no version change: it is read live and ends at midnight India time at the end of that date. A test fails the build if any signed-in page or API route skips this check.

### BR-PLT-09 · Password links

The link's code is 32 random bytes. Only its SHA-256 hash is stored, so a copy of the database cannot be used to set anyone's password. A link lasts 72 hours and is marked used the moment it is claimed, so two tabs racing the same link cannot both set a password. The code travels after `#`, which browsers never send to a server, so it stays out of server logs, proxies and referrer headers.

### BR-PLT-10 · Signing out other devices

Setting or changing a password stamps the account with the time, to the second. Any session issued before that stamp is signed out on its next request. The device that made the change is issued a new session straight after, so it survives.

### BR-PLT-11 · Google sign-in

A standard OpenID Connect sign-in with no third-party library. The app sends a one-time state, a nonce and a PKCE challenge, held in a signed cookie for 10 minutes. On return it checks the state, exchanges the code, verifies the ID token's signature against Google's published keys, and requires the issuer to be Google, the audience to be this app, the token unexpired, the nonce to match and the email to be verified. Only then is the email compared with accounts. Settings: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_BASE_URL`; the Google consent screen must be set to External, or Gmail addresses are refused.

### BR-PLT-12 · Email

Mail goes out from a Google Workspace mailbox over SMTP with an app password (`MAIL_USER`, `MAIL_APP_PASSWORD`, optional `MAIL_FROM`). Sending never throws into the caller: it reports sent, or not configured, or failed, and a failure is never shown as sent.

### BR-PLT-13 · Account rules in one place

The rules in FR-PLT-030 and FR-PLT-031 live in one module that the People form and the server both use, so the form can never accept what the server refuses. Emails are stored lower-case and trimmed. A new account gets a username derived from its email, because the older column requires one, but nobody signs in with it.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| User account | users | Name, username (unique), password hash and salt, role, head flag, active flag, and when the user last opened the applicant queue. From v4.0 also: email (unique, lower-case), session version, interviewer duty, access-until date, resource link (unique), whether a password has been set, when sessions were last revoked, and last sign-in. Created timestamp. |
| Password link | password_links | Account, SHA-256 hash of the code, expiry, used and cancelled times, who sent it. |
| Account log | account_events | Account, who acted, what happened, sign-in method, the address tried on a failed sign-in, and a JSON detail (before and after values, or the reason). |
| Sidebar preference | cookie | Whether the sidebar is collapsed, in that browser only. |
| Session | cookie | The signed token described in BR-PLT-02. Nothing about the session is stored on the server. |

## 6. Interfaces

- **Every module** is gated by the access policy, and most record their actor through this module.
- **Staffing Pipeline (FSD-02)** uses the ownership rules, the owner pickers and the commercial-figure removal.
- **Candidates (FSD-03)** supplies the new-applicant count shown on the sidebar.
- **Job Board (FSD-04)** is the main public surface this module opens up.
- **Resources (FSD-07)**: a Resource login links to one resource record.
- **Google Workspace**: the mailbox that sends password links, and Google sign-in (BR-PLT-11, BR-PLT-12).
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
- **v3.1** · 24 Sep 2026 · 686d99f · M47 — **live**  
  Searchable pickers across every form that lists records.
- **v4.0** (major) · 28 Sep 2026 · 9a8b2fb…dc9920e on `feat/accounts-sign-in` · Accounts & sign-in plan — **built, awaiting release**  
  Email and Google sign-in, the People screen, password links by email, changing your own password, changes applied on the next request, the account log, and four new roles behind a holding page. Record the merge commit and release tag here when it ships.

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-PLT-01 | Move production to AWS — Production moves to the Lightsail server at staffing.techstalwarts.com, and Vercel becomes the testing environment with its own database and secrets. The server is already live. The date is held by the Product Owner. | Plan M51 | High | `Planned` |
| FS-PLT-02 | Scheduled backups of the AWS database file — The backup script in the repository points at the original database layout and needs repointing to the SQLite file. Until it runs on a schedule, recovery depends on Lightsail snapshots. | Plan M50 | High, before FS-PLT-01 | `Planned` |
| FS-PLT-03 | Tag releases — Tag `5e43f82` as `release-1.0.0`, then cut a tag each time `main` moves, following the Register's versioning rules. | This FSD set | Medium | `Proposed` |
| FS-PLT-04 | End sessions when an account is disabled or its role changes | This review | Medium | `Built` → FR-PLT-027 |
| FS-PLT-05 | Account management screen for Admin | This review | Medium | `Built` → FR-PLT-029 to 032 |
| FS-PLT-06 | Users change their own password | This review | Medium | `Built` → FR-PLT-034 |
| FS-PLT-07 | Lock out repeated failed sign-ins — Today each failure is only slowed by 0.4 seconds. | This review | Low | `Proposed` |
| FS-PLT-08 | Interviewer access — The Interviewer role and interviewer duty exist from v4.0, behind the holding page. What an interviewer sees (their own rounds, with the candidate and JD) is FSD-16. | Plan M31 | High | `Planned` |
| FS-PLT-09 | Email sending | Plan P9 | — | `Built` → FR-PLT-032, BR-PLT-12 |
| FS-PLT-10 | Named sub-teams — Heads currently oversee everyone in their role. Named teams would need a new record and would change how every dashboard is scoped. | Plan P10 | Only if needed | `Deferred` |
| FS-PLT-11 | Credential hygiene — Rotate the Turso token that was once printed to a transcript. Move the GitHub token out of the git remote URL and into a credential helper. | Plan, Deployment Status | High | `Planned` |
| FS-PLT-12 | Write the production and testing URLs in the README — Confirming a deploy then takes one command instead of knowing the Vercel hostname. | Plan, Deployment Status | Low | `Planned` |
| FS-PLT-13 | Release v4.0 — Run the additive migration on production on the Product Owner's instruction, then deploy. Before that: create the Workspace mailbox with 2-step verification and an app password, and the Google OAuth client (consent screen External) with the production and testing redirect addresses; send one real link and complete one real Google sign-in on each environment; add emails to existing accounts from the People screen. | Accounts & sign-in plan | High | `Planned` |
| FS-PLT-14 | Access requests — Hide sensitive fields by default and let a person request access with a reason, approved by Admin, time-limited and enforced on the server. | FSD-00 §7, G-PLT-05 | High | `Planned` |

## 9. Known limitations

- **Until v4.0 is released, disabling an account does not sign it out.** In the live v3.1 a session keeps working until its 12 hours are up, and a role change applies at the next sign-in. v4.0 closes this (FR-PLT-027).
- **Two access gaps in the pipeline.** Lead Generation receives deal value on the pipeline screen, and the server accepts requirement deletion from Lead Generation and Sales without an ownership check. Both are set out in FSD-02, section 9, with fixes proposed as FS-PIP-01 and FS-PIP-02.
- **No "forgot password" on the sign-in page.** By decision, only Admin sends password links. Someone who has forgotten theirs asks Admin, or uses Sign in with Google.
- **Failed sign-ins are logged with what was typed as the address.** If someone types their password into the email box by mistake, it appears in the account log, which only Admin can read.
- **A session issued in the same second as a password change survives it.** The revocation stamp is kept to the second, like the session's own issue time.
- **Google sign-in is off until configured.** Without the Google settings and the site address the button is hidden; a Gmail address is refused if the consent screen is left as Internal.
- **Share links are readable by anyone who has them.** That is intended. The page shows the JD and requirement only, never budgets, contacts or candidates.
- **AWS runs an older build.** The Lightsail server runs `e5a1a5a`, which predates the five roles. It holds no production data and nobody uses it until FS-PLT-01.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v3.1 | First issue, written against commit `5e43f82`. |
| 2.0 | 28 Sep 2026 | v4.0 | Accounts & sign-in: FR-PLT-025 to 037 and BR-PLT-08 to 13 added; FR-PLT-001 and 009 retired; FS-PLT-04, 05, 06 and 09 built; FS-PLT-13 and 14 added; limitations updated. Records two decisions made during the build: the link's code travels after `#` (Product Owner, 28 Sep 2026), and password changes sign other devices out by a revocation stamp rather than a session-version bump, so a refresh cannot quietly re-admit another device. |
| 2.1 | 21 Oct 2026 | v4.1 (built) | M65: FR-PLT-036a — Resource and Resource Manager given their screens (FSD-18). Accounts and Interviewer remain pending. |
| 2.2 | 22 Oct 2026 | v4.2 (built) | M66: FR-PLT-036b — Lead Generation and Sales given the Prospects, Campaigns and Leads screens (FSD-14, FSD-15). |
| 2.3 | 23 Oct 2026 | v4.3 (built) | M65 addendum: FR-PLT-036c, the Admin-only timesheet dashboard. |
| 2.4 | 23 Oct 2026 | v4.3 (built) | M65 addendum: FR-PLT-036d, leave access. |
| 2.5 | 23 Oct 2026 | v4.4 (built) | M67: FR-PLT-036e — the Resource Manager given Reviews and the Skill Matrix; Sales given read-only account reviews (FSD-17). |
