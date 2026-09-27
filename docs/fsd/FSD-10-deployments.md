# Deployments

`FSD-10 · DEP`

Which resource is working on which project, how much of their time it takes, what the client is billed for it, and what it costs to run. This module enforces the 100% allocation cap and computes margin.

| Field | Value |
|---|---|
| Module code | DEP |
| Module version | v2.2 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Deployments |
| Screens | /deployments · /deployments/[id] |
| Owner | Product Owner |

## 1. Purpose and scope

A deployment puts one resource on one project for a share of their time, from a start date, either **billable** (the client pays) or **shadow** (the client does not pay: an understudy or backup). A resource can hold several deployments at once, as long as together they come to no more than 100%.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| View deployments, billing and margin | Yes | Yes | — | — | — |
| Add, edit, end, delete | Yes | — | — | — | — |

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **List** | | | |
| FR-DEP-001 | The list shows resource, project and client, type, period, and billing with its GST. It filters by status (**Active, Ended, All**) and by type (**All, Billable, Shadow**), and by client with a searchable picker. Search covers resource, project and client. The list shows 20 rows to a page. | v2.1 | `Live` |
| **Adding and editing** | | | |
| FR-DEP-002 | A deployment records project, optional agreement or PO, resource, type, allocation %, start date, optional end date, currency, monthly billing, monthly commission, monthly operations overhead, and whether GST applies. | v2.0 | `Live` |
| FR-DEP-003 | Project, agreement and resource are searchable pickers. Each resource option shows how much of their time is free and their rate. | v2.1 | `Live` |
| FR-DEP-004 | Choosing an agreement limits it to the chosen project, offers the resources on its rate card, fills in the billing amount from the rate card, and locks the currency to the agreement's. | v1.1 | `Live` |
| FR-DEP-005 | Allocation is typed as a whole percentage from 1 to 100, with 25, 50, 75 and 100 as one-click presets. The form shows the resource's available headroom and warns before saving if the request is over it. | v2.2 | `Live` |
| FR-DEP-006 | The form previews billing, GST, total and margin as figures are entered, using the same calculation as the detail page and the dashboard. | v2.0 | `Live` |
| FR-DEP-007 | Choosing **Shadow** sets billing, commission and overhead to zero and turns GST off. | v1.0 | `Live` |
| **Ending and removing** | | | |
| FR-DEP-008 | **End** asks for an end date (not before the start date), marks the deployment ended, and frees its allocation. An ended deployment cannot be ended again. | v1.0 | `Live` |
| FR-DEP-009 | **Delete** removes a deployment outright. | v1.0 | `Live` |
| **Detail page** | | | |
| FR-DEP-010 | The deployment page shows the engagement (resource, designation, project, client, allocation, dates), the money (base billing, GST, invoice total, then each cost line and the margin), the agreement and the rate it came from, and the resource's full utilisation across all their active deployments. | v2.0 | `Live` |
| **Other entry points** | | | |
| FR-DEP-011 | Converting a won requirement can open 100% billable deployments for joined candidates (FSD-02). Deployments can also be bulk-loaded from CSV by an operator, with the same 100% cap applied. | v1.1 | `Live` |

## 4. Business rules

### BR-DEP-01 · The 100% cap

The allocation of a resource's active deployments, billable and shadow together, can never exceed 100%. A request that would exceed it is refused with the headroom stated, for example "This resource has 40% allocation available, but 50% was requested." Editing re-checks the cap without counting the deployment being edited.

### BR-DEP-02 · Billable needs a rate

A billable deployment must have a billing amount above zero. Commission cannot exceed billing. An end date cannot be before the start date.

### BR-DEP-03 · Currency and GST

A deployment under an agreement uses the agreement's currency. A deployment with no agreement can use any of INR, AED or USD. GST at 18% applies only to INR deployments, and is refused on AED or USD.

### BR-DEP-04 · Margin (per month)

Salary cost is the resource's CTC in force (FSD-07, BR-RES-02) divided by 12, then pro-rated by allocation so a split resource is not charged twice. Margin is shown only for INR deployments where the resource has a CTC. For AED and USD deployments the page says a rate is needed, because salary is in rupees and nothing is converted. A shadow deployment shows its figure as a **cost**, not a negative margin.

```text
salary cost = round(CTC in force ÷ 12 × allocation %)
margin      = billing − (salary cost + commission + operations overhead)
GST         = billing × 18%        (INR only)
invoice total = billing + GST
```

### BR-DEP-05 · End date does not end a deployment

An end date in the past does not change the status. The deployment stays active, and keeps its allocation, until someone uses End. It does appear in the dashboard's Ending Soon list.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Deployment | deployments | Resource, project, optional agreement, type, allocation, start and end dates, currency, billing, commission, operations overhead, GST flag, status (active or ended), and the date created. |

## 6. Interfaces

- **Resources (FSD-07)**: utilisation and CTC in force.
- **Agreements (FSD-11)**: rate card, currency and the project check.
- **Projects and Clients (FSD-09, FSD-08)**: deployed team and monthly billing roll-ups.
- **Dashboard (FSD-13)**: billing, margin, utilisation, ending soon, billing by client.

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M4  
  Billable and shadow deployments, the 100% cap, GST, End, and the utilisation view.
- **v1.1** · 7 Sep 2026 · 7a863e3 · —  
  Link to an agreement, with billing drawn from its rate card. CSV import of deployments. List filters and paging.
- **v1.2** · 7 Sep 2026 · 087f412 · M14  
  Currency per deployment, locked by the agreement. GST limited to INR.
- **v1.3** · 7 Sep 2026 · 966d037 · M15  
  Deployment detail page.
- **v2.0** (major) · 15 Sep 2026 · 9e78493 · M40  
  Margin redefined to include salary cost pro-rated by allocation, plus operations overhead. Before this it was billing less commission, so the reported margin fell when this shipped.
- **v2.1** · 24 Sep 2026 · 686d99f · M47  
  Searchable project, agreement, resource and client pickers.
- **v2.2** · 25 Sep 2026 · ae67af9 · M58 — **current**  
  Allocation typed as a number with presets, replacing a slider that moved in steps of 5, so splits like 33% are now possible. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-DEP-01 | Flag deployments past their end date — List them for someone to end, or end them automatically, so their allocation is freed (BR-DEP-05). | This review | High | `Proposed` |
| FS-DEP-02 | Margin on AED and USD deployments — An optional exchange rate on the deployment, as invoices already have, so margin can be worked out in rupees. | Plan P11 | Medium | `Proposed` |
| FS-DEP-03 | A standard operations overhead — Every deployment's overhead is still 0, so margin reflects salary and commission only. A standard per-head figure from the Product Owner could be applied to open deployments. | Plan P11 | Medium | `Proposed` |
| FS-DEP-04 | Keep deployment history on delete — Delete removes a deployment with no check, which erases utilisation history and can remove the only thing that stops a resource from being deleted. Allowing delete only on deployments created in error, and using End otherwise, would keep the record. | This review | Medium | `Proposed` |
| FS-DEP-05 | Rate history — Editing a billing rate overwrites the old one. Keeping dated rates would let past months be restated accurately. | This review | Later | `Proposed` |
| FS-DEP-06 | Overhead as a percentage of billing — Overhead is an amount, matching commission. A percentage would be a different field. | Plan P11 | Only if needed | `Deferred` |

## 9. Known limitations

- **Deployments past their end date stay active.** See BR-DEP-05 and FS-DEP-01.
- **Margin is partial.** It covers only INR deployments where the resource has a CTC, and overhead is zero everywhere until FS-DEP-03.
- **Delete is unguarded.** See FS-DEP-04.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v2.2 | First issue, written against commit `5e43f82`. |
