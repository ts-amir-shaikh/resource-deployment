# Projects

`FSD-09 · PRJ`

An engagement for a client, run by a named project manager on the client's side. Deployments, agreements and invoices all belong to a project.

| Field | Value |
|---|---|
| Module code | PRJ |
| Module version | v1.4 (built; v1.3 live) |
| Doc revision | Rev 1.1 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Projects |
| Screens | /projects · /projects/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

The project is the unit that people are deployed to and invoices are raised against.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View projects | Yes | Yes | — | — | — |
| Add, edit, delete projects | Yes | — | — | — | — |

Admin also creates projects from the pipeline with **Convert to Project**.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-PRJ-001 | The list shows project, client, project manager, deployed headcount and monthly billing. It can be searched by project, client or manager, filtered by client with a searchable picker, and shows 20 rows to a page. | v1.3 | `Live` |
| FR-PRJ-002 | A project records the client (required, from a searchable picker), the project name (required), and the project manager's name, email, mobile and designation. | v1.3 | `Live` |
| FR-PRJ-003 | The project page shows the deployed team (resource, type, allocation, period, billing), the agreements and POs, the invoices, the project manager, and an at-a-glance summary. | v1.2 | `Live` |
| FR-PRJ-004 | A project cannot be deleted while it has an active deployment, any agreement, any invoice, or any deployment history. | v1.0 | `Live` |
| FR-PRJ-005 | **Convert to Project** on a won requirement creates the project, and optionally its first deployments (FSD-02). | v1.0 | `Live` |
| FR-PRJ-006 | Projects can be bulk-loaded from CSV by an operator. | v1.1 | `Live` |
| FR-PRJ-007 | **Default timesheet version (M65, D10).** The project page shows the timesheet version its deployments use unless they set their own — v1 Daily (default) or v2 Tasks — and Admin can change it there. See FSD-18. | v1.4 | `Built` |

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Project | projects | Client, project name, manager name, email, mobile and designation, and the date created. |

## 6. Interfaces

- **Clients (FSD-08)**: every project belongs to one client.
- **Deployments, Agreements, Invoices (FSD-10 to FSD-12)**: all belong to a project.
- **Staffing Pipeline (FSD-02)**: conversion creates the project.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M3  
  Project records, delete guards, and creation by conversion from the pipeline.
- **v1.1** · 7 Sep 2026 · 1311d30 · 67df20d · —  
  CSV import, search and paging.
- **v1.2** · 7 Sep 2026 · 087f412 · 966d037 · M14 M15  
  Billing per currency, and the project detail page.
- **v1.3** · 24 Sep 2026 · 686d99f · 9d82bc6 · M47 — **current**  
  Searchable client picker on the form and on the list filter. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-PRJ-01 | Project status and dates — A project has no start, end or closed status. It is "active" only in the sense that it has active deployments. | This review | Medium | `Proposed` |
| FS-PRJ-02 | Show the requirement a project came from — The requirement records the project it was converted into, but the project page does not link back. | This review | Low | `Proposed` |
| FS-PRJ-03 | A Project pipeline — Named by the Product Owner as one of the pipelines to follow the Staffing Pipeline (FS-PIP-03). It will be scoped separately. | Product Owner | Next | `Planned` |

## 9. Known limitations

- **No project lifecycle.** A project whose people have all rolled off still appears, and cannot be deleted while its history exists (FS-PRJ-01).

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v1.3 | First issue, written against commit `5e43f82`. |
| 1.1 | 22 Oct 2026 | v1.4 (built) | M65: FR-PRJ-007 default timesheet version; new column `projects.timesheet_version`. |
