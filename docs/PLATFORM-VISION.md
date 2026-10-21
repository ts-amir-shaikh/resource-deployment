# Platform vision

Stated by the product owner on 2026-09-27. Check every new plan and FSD
revision against this document.

The application is meant to be a **single platform where nine departments
collaborate** on operational and business work — not a deployment tracker with
bolt-ons.

## The nine departments

| Department | Owns |
|---|---|
| **Leadgen** | Generates leads through cold calling, outreach and campaigns; manages prospects. |
| **Inside Sales / Sales** | Turns prospects into clients; generates and manages requirements from existing clients too. |
| **Recruiters / TA** | Fulfil requirements from prospects and clients. Own candidate evaluation, the talent pool and pipeline management. |
| **Accounts** | Purchase orders and agreements; creating and managing invoices. |
| **Interviewer panel** | Reviews submissions, sees its scheduled interviews, shares available interview slots. |
| **Resource Manager** | Candidate skill metrics and utilisation; submits the monthly account and candidate reviews. |
| **Resources** (deployed people) | Submit timesheets. |
| **Admin** | Operational activities and overrides. |
| **Management** | View access and custom reports. |

## The end-to-end journey

```
campaign for outreach → prospect → meetings → leads → requirements →
qualification → candidate mapping → interviews → agreement → deployment
```

## Where the build actually stands

Today's app covers roughly **requirements through deployment**.

Accounts, Interviewer, Resource Manager and Resources now exist as **roles**
(all nine roles are implemented, with account management, expiring access and a
`/welcome` holding page), but they have **no screens of their own** — they sign
in and can open nothing else. Campaigns, outreach, meetings and timesheets have
no module at all.

Proposed modules, from the 2026-09-27 gap review (FSD-00): FSD-14 Campaigns,
FSD-15 Prospects/Meetings/Leads, FSD-16 Interviewer Portal, FSD-17 Resource
Management, FSD-18 Timesheets, FSD-19 Reports, FSD-20 Accounting Sync (Tally).

**Recommended order:** fix findings → roles → Accounts → Timesheets →
Interviewer → Leads → Campaigns → Resource Mgmt → Reports.

Roles are done. **Accounts is the next and cheapest win**, because the role,
account management and expiring access already exist — what is missing is the
screens.

## Settled decisions (2026-09-27, recorded in FSD-00 Rev 1.1)

| # | Decision |
|---|---|
| **D1** | Resources get their own logins. |
| **D2** | The Resource Manager approves timesheets. |
| **D3** | Timesheets are entered day by day, approved at a daily, weekly or monthly cadence. |
| **D4** | A prospect is *converted* into a lead, which is a separate record. |
| **D5** | External interviewers get access — invited, scoped to their rounds, expiring. |
| **D6** | Accounts sees margin and salary, and monitors the app↔Tally sync. (Added FSD-20.) |
| **D7** | Fixed reports first; a report builder later. |
| **D8** | Sales sees deployments at their clients, with costs hidden. |

## Standing design principle

**Sensitive fields are hidden by default.** Access can be *requested*, and a
grant is narrow, time-limited, audited and enforced server-side. This was
designed once in the roles foundation, before external interviewers or resource
logins go live. Honour it in every new module rather than re-deciding per
screen.

## The feature-gap register

**FSD-00A** (`docs/fsd/FSD-00A-feature-gap-register.md`) is the live backlog:
96 gaps across 11 areas, IDs prefixed `G-PLT`, `G-LED`, `G-SAL`, `G-TA`,
`G-INT`, `G-RM`, `G-RES`, `G-ACC`, `G-TLY`, `G-ADM`, `G-MGT`.

**96 gaps in total.** At Rev 1.4, six Must items closed with the M60 release,
leaving **55 Must and 35 Good-to-have open**.

**Cut plans from the Must items first.**

> **Known defect in that document:** its own summary table still reads
> `Must 61 / Good to have 35` — the Rev 1.3 figures — and the individual rows
> below it still read as at Rev 1.3. Only the note under the table records the
> six closures. Correct the table when you next revise it, and until then do
> not quote its summary numbers.

---

## Tally integration (TallyPrime)

The books live in **TallyPrime**. The design is a **separate bridge app**
deployed on the Tally machine: it reads (and later writes) Tally locally and
connects out to our app. Users only ever work in our app.

- **Phase 1 is inbound only** (Tally → app): ledgers, sales vouchers, receipts
  and outstanding bills, with mapping, a sync log and reconciliation.
- **Phase 2** adds outbound writes, behind approval.

### Verified facts from the connectivity test (2026-09-27)

- TallyPrime **7.0 Gold** (multi-user). The XML/HTTP and ODBC server listens on
  **port 9000**, and the test reached it.
- One company, exact name `TechStalwarts LLP - from April 1, 2021`, holding
  every financial year from FY 2021-22.
- **529 ledgers** returned. Filter to **Sundry Debtors** before matching to
  clients.
- The machine is `DESKTOP-90812NU`, Windows 11, 5.9 GB RAM. Node and `npx tsx`
  both work there, so the bridge can be TypeScript.
- **Tally only answers while it is open with the company loaded.**
- **Port 9000 has no authentication** — restrict it to localhost.
- Working pattern: an Export Collection request with an inline TDL collection
  and `SVCURRENTCOMPANY`, sent to `localhost:9000`.

The throwaway test script is `tally-test.ts` at the repo root. It is
**untracked and uncommitted** — treat it as a scratch reference, not a
foundation.

### What the bridge still needs beyond that script

- A real XML parser.
- A filter to the Sundry Debtors group.
- `GUID`, `MasterID` and `AlterID` fetched, for idempotent incremental sync.
- Voucher requests paged by month.
- Detection of `LINEERROR` inside HTTP 200 responses — Tally returns errors
  with a success status.

### Sync cadence (confirmed 2026-09-28)

- Twice a day, on a schedule held by **the bridge**, not Tally Scheduler, plus a
  manual **Sync now** for the accountant.
- The laptop stays on during working hours, so both runs are scheduled inside
  those hours and missed runs catch up.
- The bridge only connects **outward**, so "Sync now" works by the bridge
  polling the app roughly once a minute: `queued → running → done/failed`.

Recorded in FSD-00A §2.
