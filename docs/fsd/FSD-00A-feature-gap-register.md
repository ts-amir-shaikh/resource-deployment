# Feature gap register

`FSD-00A · GAP · Rev 1.3`

What each department still needs before it can run its part of the journey on this platform. Each gap is marked `Must` (the operation cannot run on the platform without it) or `Good to have` (it works without it, but slower or with less insight). This list comes before any plan. Plans are cut from the Must items first.

| Field | Value |
|---|---|
| Date | 27 Sep 2026, last revised 21 Oct 2026 |
| Against | FSD-00 Rev 1.2 · code f029715 |
| Must | 57 |
| Good to have | 35 |
| Areas | 11 |
| Tally approach | Bridge app, inbound then outbound (D14) |
| Status | `For review` |
| Owner | Product Owner |

## 1. Summary

| Area | Must | Good to have |
|---|---|---|
| Platform & access | 9 | 5 |
| Lead generation | 6 | 3 |
| Inside sales / Sales | 4 | 3 |
| Recruitment / TA | 3 | 4 |
| Interviewer panel | 5 | 3 |
| Resource management | 5 | 4 |
| Resources (deployed) | 4 | 4 |
| Accounts | 7 | 3 |
| Tally integration | 14 | 3 |
| Admin | 3 | 1 |
| Management | 3 | 2 |
| **Total** | **57** | **35** |

*Six Must items closed on 20 Oct 2026 with the M60 release — see Rev 1.4. Individual rows below still read as at Rev 1.3 and are corrected as each area is next revised.*

*The **Total row is authoritative**. The per-area rows for **Platform & access** and **Management** still carry Rev 1.3 figures and together overstate Must by six — that difference is the M60 release. They are corrected when those areas are next revised. The Lead generation, Resource management, Accounts and Tally rows are current as at Rev 1.5.*

**How Must was judged:** an item is Must when a department named in FSD-00 cannot do its stated job on the platform without it, when a decision (D1–D8) depends on it, or when it closes an access or accuracy defect already found. Everything else is Good to have, however valuable.

## 2. Tally integration: the agreed shape

- **TallyPrime** stays the books of record. A separate **bridge application** is installed on the machine where TallyPrime runs. It reads from Tally locally, through TallyPrime's built-in XML/HTTP interface, and in later phases writes to it.
- **The bridge connects out to this application** over HTTPS with its own credential. Users interact through this application, never with the bridge directly. Connecting outward means no port is opened on the Tally machine to the internet. This is recommended; the direction still needs confirming.
- **Phase 1 is Tally → app only**: ledgers, sales vouchers, receipts and outstanding bills, read and reconciled. Nothing is written to Tally until phase 2 is separately approved.
- **Sync twice a day**, on a schedule, plus a **Sync now** button the accountant can press at any time (confirmed 28 Sep 2026).
- **The Tally laptop stays on during working hours** (confirmed 28 Sep 2026). Both scheduled runs are therefore set inside working hours, for example late morning and late afternoon IST. A run missed because the laptop was off happens when the bridge is next online, and the app shows it as late.
- **How Sync now reaches the bridge.** The bridge connects out to us, so the app cannot call it. While it is running, the bridge checks the app every minute or so for a pending sync request. The button therefore takes up to a minute to start, and the screen shows the request as *queued*, then *running*, then *done* or *failed*. The schedule lives in the bridge, so Tally's own Scheduler (port 10089) is not needed for this.

### Confirmed by the connectivity test (27 Sep 2026)

A TypeScript test script was run with `npx tsx` on a Windows machine at the office. It listed the loaded companies and pulled the ledger list through TallyPrime's XML interface. TallyPrime's About screen was checked alongside it.

| Fact | Value | What it means for the bridge |
|---|---|---|
| Product | TallyPrime Release 7.0, Gold (multi-user), 10 virtual users, TSS valid to 28 Feb 2027 | A current release, so the XML interface is supported. An upgrade is available; test the bridge again after any upgrade. |
| Integration port | Client/Server and ODBC services: **Server with ODBC, port 9000** | The HTTP/XML interface is on. The test reached it. `Proven` |
| Companies | 1 loaded: **TechStalwarts LLP – from April 1, 2021** | One company, holding every financial year from FY 2021-22. The bridge asks for it by exact name, and chooses the period in each request. |
| Ledgers | **529** returned, including customers, expenses, advances and assets | Only customers are clients. The bridge must filter by ledger group (Sundry Debtors and its sub-groups) before matching ledgers to clients. |
| Data location | D:\TallyPrime3.0\DATA (shared), backups at d:\24062024 | The bridge never touches data files. It reads through the port only. |
| Customisation | 1 TDL and 1 plug-in loaded | Check the TDL does not change the reports the bridge reads. If it ever does, the bridge's results will change with it. |
| Remote access | Tally Gateway Server DESKTOP-90812NU:9999, connected to the internet. Online access available | That is Tally's own remote service, separate from our bridge. Leave it as it is. |
| Machine | DESKTOP-90812NU: Windows 11, Ryzen 5 3500U, **5.9 GB RAM**, 1366×768 display (a laptop) | The bridge must be light. It should run as a background Windows service that starts with Windows and survives sleep and loss of network. |
| Runtime | Node.js with `npx tsx` works on that machine | The bridge can be written in TypeScript, like this app, and share its data types. |

### From the test script to the bridge

The script (`tally-test.ts`, now in the repository) sends two read-only requests to `localhost:9000`. Each defines a small Tally collection inline, one for companies and one for ledgers, names the company, and reads back the names. It proves the right pattern. The bridge keeps that pattern and adds the following:

| Script today | The bridge needs | Why |
|---|---|---|
| Reads names with a text pattern | A real XML parser | Company and ledger names with "&", quotes or unusual characters come back escaped. A pattern either misreads them or drops them without any warning. |
| Asks for Name and Parent, but uses Name only | Ask only for ledgers under Sundry Debtors, including its sub-groups. Tally collections can filter by group, but check how on this company. | Matching all 529 ledgers to clients would offer expense and asset accounts as clients. |
| No record identifiers | Also fetch GUID, MasterID and AlterID for every ledger and voucher | GUID is a stable key, so re-running never duplicates. AlterID changes on every edit, so only changes need pulling. |
| One request, 15-second timeout | Vouchers requested month by month, with a longer timeout and retries | Ledgers are few. Invoices and receipts since April 2021 are many, and one large request would time out on a 5.9 GB laptop. |
| Treats any HTTP 200 as success | Also check the response body for Tally's own error messages (for example LINEERROR) | Tally can report a failure inside a successful HTTP response, such as a wrong company name. |
| Prints to the console | Sends data to this app's ingestion endpoint over HTTPS with the bridge's own key, and logs each run | Users see sync status and mismatches in the app, never on the Tally machine. |

Two things it already gets right: it talks to `localhost`, and it only ever reads. Keep both. Nothing writes to Tally until phase 2.

> **Two constraints the test surfaced.** (1) **Tally must be open.** TallyPrime answers on port 9000 only while it is running with the company loaded. It is a desktop application, not a background service. When Tally is closed, or the laptop is asleep, the bridge can only wait and report "Tally not reachable". (2) **Port 9000 has no password.** Anything that can reach it can read, and write, the books. The bridge should connect to `localhost`, and Windows Firewall should limit port 9000 to that machine, unless other computers on the office network rely on it (check the ODBC users first).

## 3. Gap register

| ID | Gap | Today | Priority | Source |
|---|---|---|---|---|
| **Platform & access · All departments** | | | | |
| G-PLT-01 | Four new roles: Accounts, Interviewer (internal and external), Resource Manager, Resource | **Part built** (FSD-01 v4.0): the roles, interviewer duty and access-until exist and can be assigned, behind a holding page. What each may open comes with FSD-11/12 and FSD-16 to 18. | `Must` | FSD-00 D1 D5 |
| G-PLT-02 | Account management in the app: invite, activate, deactivate, change role or head flag | **Built** (FSD-01 v4.0, FR-PLT-029 to 031), awaiting release | `Must` | FS-PLT-05 · D1 |
| G-PLT-03 | Self-service password set, reset and change, by emailed link | **Built** (FR-PLT-032 to 034), awaiting release. Links are sent by Admin; there is no self-service "forgot password" by decision. | `Must` | FS-PLT-06 · D1 |
| G-PLT-04 | End sessions at once when an account is disabled or its role changes | **Built** (FR-PLT-027, 028): takes effect on the next request. Awaiting release. | `Must` | FS-PLT-04 |
| G-PLT-05 | Sensitive-field model and access requests: request with a reason, approve, time-limited grant, enforced on the server | Fixed role rules only | `Must` | FSD-00 §7 |
| G-PLT-06 | Email service for invites, password links, approvals, interview bookings and reminders | **Built** for password links (BR-PLT-12: Workspace mailbox over SMTP). Other emails reuse it as their modules ship. Awaiting release. | `Must` | FS-PLT-09 |
| G-PLT-07 | Audit log of overrides, grants, approvals and financial edits | **Part built**: the account log covers every account change and sign-in (FR-PLT-035). Overrides, grants, approvals and financial edits still need it. | `Must` | This review |
| G-PLT-08 | Close the access gaps found in the FSDs (Lead Generation deal value, requirement deletion) | Open. Fix task running | `Must` | FS-PIP-01 · 02 |
| G-PLT-09 | Scheduled backups on the AWS server before production moves there | None scheduled | `Must` | FS-PLT-02 |
| G-PLT-10 | In-app notification centre (bell, unread count), beyond the applicant badge | Applicant badge only | `Good to have` | This review |
| G-PLT-11 | Google Workspace sign-in for internal staff | **Built** (FR-PLT-026) for Gmail and techstalwarts.com addresses alike. Awaiting release. | `Good to have` | This review |
| G-PLT-12 | Lock out repeated failed sign-ins | 0.4-second delay only | `Good to have` | FS-PLT-07 |
| G-PLT-13 | Activity timeline on each record (client, requirement, candidate, resource) | Scattered across tables | `Good to have` | This review |
| G-PLT-14 | Bulk import from the app instead of the command line | CSV import tool for operators | `Good to have` | This review |
| **Lead generation · Leadgen** | | | | |
| G-LED-01 | Prospect list and page: status, owner, several contacts, source, notes. Create one without a requirement | Prospect only created from the requirement form | `Must` | FS-CLI-05 · FSD-15 |
| G-LED-02 | Outreach log: call, email, LinkedIn, event, with outcome and next follow-up date | None | `Must` | FSD-14 |
| G-LED-03 | Campaign record: name, segment, channel, dates, with outreach and prospects linked to it | None | `Must` | FSD-14 |
| G-LED-04 | Meetings: date, attendees, notes, outcome, next step, on a prospect or lead | None | `Must` | FSD-15 |
| G-LED-05 | Convert prospect → lead, then lead → one or more requirements | Requirement stands in for a lead | `Must` | D4 · FSD-15 |
| G-LED-06 | Duplicate check on prospect and client names | None | `Must` | FS-CLI-02 |
| G-LED-07 | Campaign results: reached, responded, meetings, leads, conversion | None | `Good to have` | FSD-14 |
| G-LED-08 | Import target lists from CSV | None | `Good to have` | This review |
| G-LED-09 | Email sequences and calendar sync for meetings | None | `Good to have` | This review |
| **Inside sales / Sales · Sales** | | | | |
| G-SAL-01 | Client account view for Sales: contacts, projects, people deployed, billing, all costs hidden | Clients is Admin-only | `Must` | D8 · FS-CLI-03 |
| G-SAL-02 | Leads raised from existing clients (account growth) | New requirements only | `Must` | D4 |
| G-SAL-03 | Qualification checklist before a requirement moves on | Stage with no criteria | `Must` | FSD-00 §3 |
| G-SAL-04 | Link the Agreement stage to an agreement record, and hand it to Accounts | Unlinked | `Must` | FSD-00 §3 |
| G-SAL-05 | Forecast by month from weighted pipeline and expected start dates | Snapshot only | `Good to have` | This review |
| G-SAL-06 | Won and lost reason analysis per period | Free-text reasons | `Good to have` | FS-PIP-06 |
| G-SAL-07 | Proposal or quote documents attached to a requirement | None | `Good to have` | This review |
| **Recruitment / TA · Recruiters** | | | | |
| G-TA-01 | Book interviews into interviewer slots, with the interviewer notified | Typed names and dates | `Must` | FSD-16 |
| G-TA-02 | Submit a shortlist for panel or client review (submission pack), with PII limited | Not built | `Must` | FS-CAN-01 |
| G-TA-03 | Duplicate warning when adding a candidate by hand | Queue only | `Must` | FS-CAN-06 |
| G-TA-04 | Talent-pool search by rated skill and proficiency | Free-text skills | `Good to have` | G-RM-02 |
| G-TA-05 | Attach a resume validation to a requirement and create a scored candidate | Not built | `Good to have` | FS-AGT-02 |
| G-TA-06 | Resume link on the public apply form | Missing | `Good to have` | FS-CAN-04 |
| G-TA-07 | WhatsApp and email outreach to candidates | None | `Good to have` | FS-CAN-10 |
| **Interviewer panel · Interviewers** | | | | |
| G-INT-01 | Interviewer accounts, internal and external: invited, expiring, limited to their assigned rounds | None | `Must` | D5 |
| G-INT-02 | Publish available slots, with TA booking into them | None | `Must` | FSD-16 |
| G-INT-03 | Scheduled-interview list: my rounds, upcoming and past | None | `Must` | FSD-16 |
| G-INT-04 | Submission review: the profile and JD for their round only, with contact details hidden unless granted | None | `Must` | FSD-16 · §7 |
| G-INT-05 | Feedback form: outcome, criterion scores, recommendation, questions asked | TA logs it on their behalf | `Must` | FSD-03 |
| G-INT-06 | Calendar invites (.ics, Google, Outlook) and a video-link field | None | `Good to have` | This review |
| G-INT-07 | Reminders before a round and when feedback is overdue | None | `Good to have` | G-PLT-06 |
| G-INT-08 | Interviewer load and pass-rate statistics | None | `Good to have` | This review |
| **Resource management · Resource Manager** | | | | |
| G-RM-01 | Timesheet approval queue, daily, weekly or monthly by setting. Approve, reject with reason, bulk approve | None | `Must` | D2 · D3 |
| G-RM-02 | Skill matrix: proficiency per skill per resource (and candidate), shared with rating criteria | Free-text skills | `Must` | FSD-17 |
| G-RM-03 | Utilisation desk: bench, partial, roll-offs, deployments past end date | Admin-only view, no past-date flag | `Must` | FS-DEP-01 |
| G-RM-04 | Mark a resource as having left, removing them from pickers and headcount | Not possible | `Must` | FS-RES-01 |
| G-RM-05 | Monthly reviews: account review per client and performance review per resource, with completion tracked | None | `Must` | FSD-17 |
| G-RM-09 | Client login for entering resource feedback directly, invited and expiring, on the D5 pattern. Deferred: the Account Manager records it on their behalf for now | Account Manager records it (D13) | `Good to have` | D13 |
| G-RM-06 | Bench ageing and a capacity forecast from end dates | None | `Good to have` | FS-RES-02 |
| G-RM-07 | Review templates and score trends over months | None | `Good to have` | This review |
| G-RM-08 | Certification and training tracking | None | `Good to have` | This review |
| **Resources (deployed) · Resources** | | | | |
| G-RES-01 | Resource self-service login: own profile, own deployments | No login | `Must` | D1 |
| G-RES-02 | Day-wise timesheet: worked, half day, paid leave, unpaid leave, holiday, per deployment. Submit, see status, correct if rejected | None | `Must` | D3 |
| G-RES-03 | Holiday calendar per client or location, pre-filling holidays | None | `Must` | FS-INV-07 |
| G-RES-04 | Approved days feed invoice lines (working days, paid and unpaid leave) for the period | Typed by hand per line | `Must` | FSD-12 |
| G-RES-05 | Leave balance and submission reminders | None | `Good to have` | FS-RES-05 |
| G-RES-06 | Mobile-friendly timesheet entry (installable web app) | Responsive pages only | `Good to have` | This review |
| G-RES-07 | Client sign-off attachment on a timesheet | None | `Good to have` | D2 note |
| G-RES-08 | Travel and expense claims against a deployment | None | `Good to have` | This review |
| **Accounts · Accounts** | | | | |
| G-ACC-01 | Accounts role: write Agreements and Invoices, see margin and CTC | Admin only | `Must` | D6 |
| G-ACC-02 | Client billing details: GSTIN, billing address, payment terms, default due days | None | `Must` | FS-CLI-01 |
| G-ACC-03 | Void and credit note for invoices already raised or collected | Not possible | `Must` | FS-INV-02 |
| G-ACC-04 | Receipts: amount received, TDS, short payment, partial collection | All-or-nothing Collected | `Must` | FS-INV-03 |
| G-ACC-05 | PO consumption: invoiced against value, remaining, warning when running low | None | `Must` | FS-AGR-01 |
| G-ACC-06 | Draft the month's invoices from approved timesheets and active deployments | Built by hand | `Must` | FS-INV-04 |
| G-ACC-10 | **Proforma invoice** as an app-owned pre-invoice state ahead of `Raised`, keeping the lifecycle forward-only | Not possible | `Must` | D15 |
| G-ACC-07 | Invoice PDF from the app (if Tally is not the document of record) | None | `Good to have` | FS-INV-05 |
| G-ACC-08 | Overdue reminders and receivables ageing alerts | Overdue flag only | `Good to have` | This review |
| G-ACC-09 | Revenue in INR at each invoice's stored exchange rate | Rate stored, unused | `Good to have` | FS-INV-06 |
| **Tally integration · Accounts** | | | | |
| G-TLY-01 | Bridge app on the Tally machine: reads TallyPrime locally and connects out to our app over HTTPS, so no port is opened on the Tally machine | None | `Must` | FSD-20 · this brief |
| G-TLY-02 | Bridge credential and health: registered bridge key, heartbeat, last-seen, version, shown to Accounts | None | `Must` | FSD-20 |
| G-TLY-03 | Phase 1 inbound sync: customer ledgers, sales vouchers, receipt vouchers, bill-wise outstanding, by company and financial year | None | `Must` | FSD-20 |
| G-TLY-04 | Incremental and idempotent: records keyed on Tally identifiers, only changes pulled, re-runs never duplicate | None | `Must` | FSD-20 |
| G-TLY-05 | Mapping: Tally ledger ↔ client (one-time mapping screen), Tally voucher ↔ app invoice (by invoice number, then by hand) | None | `Must` | FSD-20 |
| G-TLY-06 | Sync log: each run with counts, failures with reasons, unmatched items, retry | None | `Must` | FSD-20 |
| G-TLY-07 | Reconciliation view: app against Tally per client and period (invoiced, received, outstanding), with mismatches listed | None | `Must` | FSD-20 · D6 |
| G-TLY-08 | ~~Tally is read-only in phase 1: nothing is written back until phase 2 is approved~~ | **Superseded by D14** (21 Oct 2026): outbound writes are in scope, behind an approval gate. Not counted. | `Superseded` | This brief · D14 |
| G-TLY-13 | The bridge runs as a Windows service: starts with Windows, restarts on failure, has a small memory footprint, and resumes after sleep or loss of network | Test script run by hand | `Must` | Test · About |
| G-TLY-14 | Filter ledgers by group (Sundry Debtors and sub-groups) before matching them to clients | Test returns all 529 ledgers | `Must` | Test |
| G-TLY-15 | Health status distinguishes *bridge offline*, *Tally not running* and *company not loaded*, and shows the last successful sync | None | `Must` | Test · About |
| G-TLY-16 | Port 9000 limited to the local machine by Windows Firewall, with the bridge on localhost (after checking ODBC users on the network) | Open to anything that can reach it | `Must` | About |
| G-TLY-17 | Move the bridge and Tally to a machine that is always on. Not needed now: the laptop stays on during working hours, and syncs are scheduled within them. | A laptop, on during working hours | `Good to have` | Resolved 28 Sep |
| G-TLY-09 | Outbound: post vouchers, **proforma** and tax invoices, create ledgers for new clients, and update status. Each queued posting is reviewed and released by Accounts; nothing posts automatically. **No delete or deactivate capability exists in the bridge** — permitted actions are an allowlist, not a filter | None | `Must` | D14 · M64 |
| G-TLY-10 | Two scheduled syncs a day within working hours, plus **Sync now** for Accounts: the bridge checks the app for requests and reports queued, running, done or failed. Missed runs catch up. | None | `Must` | Confirmed 28 Sep |
| G-TLY-18 | Inbound **expense** ledgers: Direct and Indirect Expenses groups, for reporting. Margin reconciliation against CTC stays separate (G-TLY-11) | None | `Must` | D16 |
| G-TLY-11 | Payroll actuals from Tally to replace CTC estimates in margin | None | `Good to have` | This review |
| G-TLY-12 | Several Tally companies (entities) in one bridge | None | `Good to have` | This review |
| **Admin · Admin** | | | | |
| G-ADM-01 | Override actions with a reason and an audit trail: reopen a collected invoice, force an allocation, reassign owners, unlock a timesheet | Direct edits only | `Must` | G-PLT-07 |
| G-ADM-02 | Approve access requests, and see active grants | None | `Must` | §7 |
| G-ADM-03 | Settings screens: timesheet approval cadence, holiday calendars, stall threshold, win probabilities | Hard-coded | `Must` | This review |
| G-ADM-04 | Data-quality desk: placeholder emails, duplicates, unmapped Tally ledgers, missing CTC | None | `Good to have` | This review |
| **Management · Management** | | | | |
| G-MGT-01 | Fixed reports with filters and CSV export: funnel and conversion, source effectiveness, utilisation, billing and margin, receivables ageing, team productivity | Dashboard only, no export | `Must` | D7 · FSD-19 |
| G-MGT-02 | Monthly snapshots, so trends can be reported (the app keeps no history of totals) | None | `Must` | FS-DSH-04 |
| G-MGT-03 | Correct the Dashboard KPI notes and the two meanings of Filled | Open | `Must` | FS-DSH-01 · 02 |
| G-MGT-04 | Report builder | None | `Good to have` | D7 phase 2 |
| G-MGT-05 | Scheduled report emails | None | `Good to have` | G-PLT-06 |

## 4. What this means for planning

- **Three things everything else depends on**: new roles and account management (G-PLT-01 to 04), access requests (G-PLT-05) and email (G-PLT-06). Timesheets, interviewers and resource logins cannot go live without all three. These form the first plan.
- **The quickest win**: the Accounts role with the existing Agreements and Invoices modules (G-ACC-01), then Tally phase 1 (G-TLY-01 to 08), which only reads and so carries little risk.
- **The largest single build**: timesheets end to end (G-RES-01 to 04, G-RM-01), because it touches resources, the Resource Manager and invoicing.
- **Can run alongside**: the front of the funnel (G-LED, G-SAL) touches none of the above, apart from roles.

## Revision history

| Rev | Date | Change |
|---|---|---|
| 1.0 | 27 Sep 2026 | First issue: 56 Must and 35 Good-to-have gaps across 11 areas, including the Tally bridge approach. |
| 1.1 | 27 Sep 2026 | Tally connectivity test confirmed. Added the TallyPrime facts, two constraints, and G-TLY-13 to 17 (now 60 Must and 36 Good to have). |
| 1.2 | 28 Sep 2026 | Sync schedule and laptop availability confirmed. G-TLY-10 is now Must, and G-TLY-17 is resolved (61 Must, 35 Good to have). |
| 1.3 | 28 Sep 2026 | Accounts & sign-in built (FSD-01 v4.0): G-PLT-02, 03, 04, 06 and 11 built; G-PLT-01 and 07 part built. Counts unchanged until release. |
| 1.5 | 21 Oct 2026 | **D9–D16 settled** (FSD-00 Rev 1.2), scoping M62–M67. **G-TLY-08 superseded** and **G-TLY-09 promoted to Must** — outbound Tally writes are in scope behind an approval gate, with no delete capability in the bridge. Three gaps added: **G-TLY-18** expense ledgers (D16), **G-ACC-10** proforma as a pre-invoice state (D15), **G-RM-09** client feedback login, deferred (D13). G-RES-02 and 04 are re-scoped for hours and tasks (D9–D11), and G-LED-01 and 05 for a lead temperature separate from stage (D12). The stale header figure of 61 Must is corrected. **57 Must and 35 Good to have remain.** |
| 1.4 | 20 Oct 2026 | Accounts & sign-in **released** to production (M60), together with CSV export (M61). G-PLT-02, 03, 04, 11 close and G-PLT-06 closes for password links; G-PLT-01 and 07 stay part built. G-MGT-01 is partly met — the export half shipped, the fixed reports did not. **55 Must and 35 Good to have remain.** |
