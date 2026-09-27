# Agreements & POs

`FSD-11 · AGR`

The signed commercial terms behind a project: the PO or agreement number, its value and dates, the currency, and the rate card of resources it covers. Renewals keep a full version history. Genuine mistakes can be corrected in place without inventing a renewal.

| Field | Value |
|---|---|
| Module code | AGR |
| Module version | v1.5 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Agreements & POs |
| Screens | /agreements · /agreements/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

An agreement belongs to one project. It is either **Individual** (one resource) or **Team** (several resources, each with their own monthly rate). Deployments bill from its rate card and inherit its currency. Invoices can be raised against it.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View agreements | Yes | Yes | — | — | — |
| Add, edit, correct, renew, delete | Yes | — | — | — | — |

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **List** | | | |
| FR-AGR-001 | The list shows agreement, project and client, scope, period, value and status. It opens on **Active**, with Renewed, Expired and All one click away. Search covers PO number, title, client and project. An **Expiring within 30 days** toggle narrows to active agreements ending soon, and those rows show the days left in amber. | v1.0 | `Live` |
| **Creating** | | | |
| FR-AGR-002 | An agreement records project (searchable), PO or agreement number, title, scope, currency, value, start and end dates, notes, and the rate card: each resource (searchable) with a monthly billing amount. | v1.5 | `Live` |
| FR-AGR-003 | An Individual agreement covers exactly one resource. A Team agreement covers one or more. Every agreement needs at least one resource and a value above zero. | v1.0 | `Live` |
| **Changing an agreement: three different actions** | | | |
| FR-AGR-004 | **Edit** changes only the PO number, title and notes, which carry no commercial meaning. | v1.1 | `Live` |
| FR-AGR-005 | **Renew** starts from the current version's terms and saves the result as a new version linked to the old one. The old version becomes *Renewed* and the version number goes up by one. The new version's rate card is its own, so resources can be added or dropped. | v1.0 | `Live` |
| FR-AGR-006 | **Correct** changes the scope, value, dates, currency or rate card in place, for terms that were never right. A reason is required and is added to the notes with the date, for example "[Corrected 2026-09-27] …". | v1.2 | `Live` |
| FR-AGR-007 | If invoices were raised against the agreement, a correction must be explicitly acknowledged. The warning says the invoices will not change and should be reviewed afterwards. | v1.2 | `Live` |
| **Detail and deletion** | | | |
| FR-AGR-008 | The agreement page shows the terms, the rate card with its total, the invoices raised against it, the full renewal chain version by version, and the deployments that bill under it. | v1.4 | `Live` |
| FR-AGR-009 | An agreement cannot be deleted if it has a newer version, any invoice, or any deployment against it. | v1.0 | `Live` |

## 4. Business rules

### BR-AGR-01 · Renew or correct?

Renew when the terms really changed, because the history should show the change. Correct when the terms were entered wrongly, because a renewal would record a renegotiation that never happened. Only the latest version can be renewed or corrected. A version already marked Renewed is history and is read-only.

### BR-AGR-02 · Expiry

An active agreement whose end date has passed becomes *Expired*. The check runs whenever the Agreements list or the Dashboard is opened.

### BR-AGR-03 · Currency is locked once used

An agreement is signed in one currency, and its deployments and invoices take that currency. A correction cannot change the currency once any invoice or deployment references the agreement. The message suggests raising a new agreement in the other currency instead.

### BR-AGR-04 · Rate-card resources in use

A correction cannot remove a resource from the rate card while a deployment for that resource bills under the agreement.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Agreement | agreements | Project, the version it renews, PO number, title, scope, currency, value, dates, version number, status (active, expired, renewed), notes. |
| Rate card line | agreement_resources | Agreement, resource and monthly billing amount. |

## 6. Interfaces

- **Deployments (FSD-10)**: rate card, currency and the project check.
- **Invoices (FSD-12)**: invoices raised against an agreement inherit its currency and read its rate card.
- **Projects and Clients (FSD-09, FSD-08)**: listed on their detail pages.
- **Dashboard (FSD-13)**: agreements expiring within 30 days.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M6  
  Agreements with Individual and Team rate cards, the renewal chain, expiry, and delete guards.
- **v1.1** · 7 Sep 2026 · 7a863e3 · 250ab79 · —  
  The rate card drives deployment billing. Edit for number, title and notes.
- **v1.2** · 7 Sep 2026 · cf2805b · M11  
  Correct in place, with the acknowledgement when invoices exist.
- **v1.3** · 7 Sep 2026 · 087f412 · M14  
  Currency per agreement, locked once it is used.
- **v1.4** · 7 Sep 2026 · 966d037 · M15  
  Agreement detail page.
- **v1.5** · 24 Sep 2026 · 686d99f · M47 — **current**  
  Searchable project and rate-card resource pickers. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-AGR-01 | PO consumption — How much of the PO value has been invoiced and what remains, with a warning as it runs low. The detail page lists invoices raised but does not total them against the value. | This review | High | `Proposed` |
| FS-AGR-02 | Renewal reminders — A dated prompt ahead of expiry, beyond the 30-day list, for example on the owner's board or by email once a provider exists. | This review | Medium | `Proposed` |
| FS-AGR-03 | Store the signed document — A link to the signed PO or agreement, in the same way candidates have resume links. | This review | Medium | `Proposed` |
| FS-AGR-04 | A correction log — Corrections are recorded as text in the notes. A structured record of what changed from and to would make audits easier. | This review | Low | `Proposed` |

## 9. Known limitations

- **Expiry is checked when a page is opened.** An agreement's status changes the next time the Agreements list or Dashboard is opened after its end date, not on the date itself.
- **Corrections do not change past invoices.** This is intended, and is stated when the correction is acknowledged.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v1.5 | First issue, written against commit `5e43f82`. |
