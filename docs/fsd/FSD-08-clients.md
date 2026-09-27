# Clients

`FSD-08 · CLI`

The companies Techstalwarts bills: their contacts, and a single view of everything held against them, including projects, POs, invoices, what is outstanding and who is deployed.

| Field | Value |
|---|---|
| Module code | CLI |
| Module version | v1.3 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Clients |
| Screens | /clients · /clients/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

A client is an onboarded company. A company not yet onboarded is a *prospect*, and prospects live in the Staffing Pipeline (FSD-02) until they are onboarded.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View clients | Yes | Yes | — | — | — |
| Add, edit, delete clients | Yes | — | — | — | — |

Admin and Sales can also create a client from the pipeline by onboarding a prospect. Every pipeline role sees client names in the company picker.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-CLI-001 | The list shows company, primary SPOC, account manager, project count and monthly billing, split by currency. It can be searched by company or SPOC and shows 20 rows to a page. | v1.2 | `Live` |
| FR-CLI-002 | A client records its company name (required) and three contacts: **Primary SPOC** (name, email, mobile, designation), **Account Manager** (name, email, mobile) and **Alternate SPOC** (name, email, mobile, designation). Emails are validated. | v1.0 | `Live` |
| FR-CLI-003 | The client page shows the contacts, projects, agreements and POs, invoices, the deployed team, and a **Commercials** block: monthly billing, outstanding, collected, and invoice count, with each currency kept separate. | v1.2 | `Live` |
| FR-CLI-004 | A client cannot be deleted while it has projects, or requirements in the pipeline. | v1.0 | `Live` |
| FR-CLI-005 | Clients are also created from the pipeline, by **Onboard as client** or **Convert to Project** on a prospect's requirement. Onboarding reuses an existing client of the same name. | v1.3 | `Live` |
| FR-CLI-006 | Clients can be bulk-loaded from CSV by an operator. | v1.1 | `Live` |

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Client | clients | Fields in FR-CLI-002 and the date created. |
| Prospect | prospects | Held by the pipeline (FSD-02). Records the client it became. |

## 6. Interfaces

- **Staffing Pipeline (FSD-02)**: requirements belong to a client or prospect, and onboarding creates the client.
- **Projects (FSD-09)**: a client has many projects.
- **Agreements and Invoices (FSD-11, FSD-12)**: rolled up on the client page.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M2  
  Client records with three contacts, and delete guards.
- **v1.1** · 7 Sep 2026 · 1311d30 · 67df20d · —  
  CSV import, search and paging.
- **v1.2** · 7 Sep 2026 · 087f412 · 966d037 · M14 M15  
  Billing per currency, and the client detail page.
- **v1.3** · 17 Sep 2026 · 3baa593 · M46 — **current**  
  Clients created from prospect records, which are linked by key and no longer matched by typed name. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-CLI-01 | Billing details — GSTIN, billing address, payment terms and a default due period. These are needed before invoices can be produced as documents from the system. | This review | High | `Proposed` |
| FS-CLI-02 | Warn about duplicate names — Adding a client does not check for an existing one with the same name. | This review | Medium | `Proposed` |
| FS-CLI-03 | Show pipeline requirements on the client page — The page shows delivery and billing, but not the open requirements for the same client. | This review | Medium | `Proposed` |
| FS-CLI-04 | Default contract terms per client — Working days per month and leave policy from the SOW, used to pre-fill invoice lines (FSD-12). | This review | Later | `Proposed` |
| FS-CLI-05 | A prospects list — Prospects are only visible through the pipeline's company picker. A list would let Lead Generation and Admin review them and tidy them up. | This review | Low | `Proposed` |

## 9. Known limitations

- **Duplicate names are possible** when a client is added by hand (FS-CLI-02).
- **Outstanding covers raised and pending invoices**, per currency, with no conversion between currencies.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v1.3 | First issue, written against commit `5e43f82`. |
