# Resources

`FSD-07 · RES`

The people Techstalwarts deploys to clients: their profile, skills, salary, and how much of their time is already committed. The allocation figure kept here is what stops anyone being booked past 100%.

| Field | Value |
|---|---|
| Module code | RES |
| Module version | v1.3 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Resources |
| Screens | /resources · /resources/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

A resource is an employee or consultant who can be deployed. This module holds who they are and what they cost. Where they are deployed is recorded in Deployments (FSD-10) and summed here as utilisation.

**Access:** Admin has full use. Management can view. No other role can open this area. TA can read resources only through the bench-link picker on a candidate, which is a narrower read.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View resources | Yes | Yes | — | — | — |
| Add, edit, delete resources | Yes | — | — | — | — |

TA can read a narrow list of resources through the bench-link picker on a candidate (FSD-03). No other role sees CTC.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-RES-001 | The list shows each resource with primary skill, CTC and a utilisation bar. Resources with no allocation are marked *Available*. The list shows 20 rows to a page. | v1.1 | `Live` |
| FR-RES-002 | Search matches name, email, designation and primary skill. An availability filter offers **All, Available** (0%), **Partial** (1–99%) and **Full** (100%). Primary-skill chips narrow the list further. | v1.1 | `Live` |
| FR-RES-003 | A resource records: name, email (required and unique), mobile, designation, current CTC per year, revised CTC per year with its effective date, primary and secondary skill, and other skills as tags. | v1.0 | `Live` |
| FR-RES-004 | A revised CTC cannot be saved without its effective-from date. | v1.0 | `Live` |
| FR-RES-005 | The resource page shows the profile, every engagement (deployment history), current utilisation, compensation with monthly figures beside annual, and monthly billing from active billable deployments. | v1.3 | `Live` |
| FR-RES-006 | A resource cannot be deleted if it has an active deployment, any deployment history, or a linked candidate profile. The message says which. | v1.0 | `Live` |
| FR-RES-007 | Resources can be bulk-loaded from CSV by an operator. The import checks every row first and writes only when told to. | v1.1 | `Live` |
| FR-RES-008 | Converting a won requirement can create a resource for an external hire (FSD-02, BR-PIP-07). | v1.0 | `Live` |

## 4. Business rules

### BR-RES-01 · CTC is always rupees

Salary is payroll and stays in INR, even when the resource bills a client in AED or USD.

### BR-RES-02 · CTC in force

The revised CTC applies once its effective date has passed. Before that, the current CTC applies. Margin (FSD-10) uses the CTC in force.

### BR-RES-03 · Utilisation

Utilisation is the sum of allocation percentages across the resource's active deployments, billable and shadow alike. It can never exceed 100%, which FSD-10 enforces.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Resource | resources | Fields in FR-RES-003 and the date created. There is no status column (see FS-RES-01). |

## 6. Interfaces

- **Deployments (FSD-10)**: supplies utilisation and billing. The CTC in force feeds margin.
- **Candidates (FSD-03)**: in-house candidates link to a resource.
- **Agreements (FSD-11)** and **Invoices (FSD-12)**: rate cards and invoice lines name resources.
- **Dashboard (FSD-13)**: headcount, utilisation distribution and skill mix.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M1  
  Resource records, the utilisation view, and delete guards.
- **v1.1** · 7 Sep 2026 · 1311d30 · 67df20d · —  
  CSV import, search, availability and skill filters, and paging.
- **v1.2** · 7 Sep 2026 · 966d037 · M15  
  Resource detail page.
- **v1.3** · 15 Sep 2026 · 9e78493 · M39 — **current**  
  Monthly CTC beside annual. The CTC in force feeds margin. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-RES-01 | Mark a resource as having left — A resource with any deployment history can never be deleted, and there is no "left" status. People who have left stay in pickers, the Available filter, and dashboard headcount. | This review | High | `Proposed` |
| FS-RES-02 | Bench ageing — For available resources, the days since their last deployment ended, so long bench time is visible. | This review | Medium | `Proposed` |
| FS-RES-03 | A shared skills list — Skills are free text, so one skill spelled two ways produces two filter chips and two dashboard bars. | This review | Medium | `Proposed` |
| FS-RES-04 | CTC history — Only the current CTC and one pending revision are kept. Older figures are overwritten. | This review | Low | `Proposed` |
| FS-RES-05 | A leave register per resource — Paid and unpaid leave is typed onto each invoice line (FSD-12). A register would supply it and keep it consistent across invoices. | This review | Later | `Proposed` |

## 9. Known limitations

- **Resources who have left cannot be removed.** See FS-RES-01.
- **A resource created by conversion may have a placeholder email.** A joined candidate with no email becomes a resource with a generated `@placeholder.local` address, which should be corrected by hand.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v1.3 | First issue, written against commit `5e43f82`. |
