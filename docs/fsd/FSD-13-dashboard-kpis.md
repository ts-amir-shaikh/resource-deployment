# Dashboard & KPIs

`FSD-13 · DSH`

One screen for Admin and Management, showing what is coming (pipeline value and win rate), what is running (billing, margin, utilisation), and what needs attention (overdue invoices, expiring agreements, follow-ups, engagements ending soon).

| Field | Value |
|---|---|
| Module code | DSH |
| Module version | v2.1 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Dashboard |
| Screens | / |
| Owner | Product Owner |

## 1. Purpose and scope

The dashboard stores nothing and changes nothing. It reads every other module and presents the current position. Every figure is live when the page is opened, and money is always grouped by currency, never converted.

## 2. Users and access

Admin and Management only. Both land here after sign-in. The front-line roles have their own boards instead (FSD-05).

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| FR-DSH-001 | An **attention strip** appears only when something needs action: pipeline follow-ups due (naming the first), overdue invoices with their amount, and agreements expiring within 30 days (naming the earliest). Each links to the screen where it can be dealt with. | v1.0 | `Live` |
| FR-DSH-002 | **Demand KPIs**: Open Pipeline (with coverage note), Weighted Pipeline, Won This Month (with deal count), Win Rate (flagged below 40%). | v1.2 | `Live` |
| FR-DSH-003 | **Delivery KPIs**: Monthly Billing (with GST beneath), Monthly Margin (with what it covers and excludes, and shadow cost), Outstanding (with overdue), Bench Utilisation (with full, partial and free counts, coloured green from 80%, amber from 50%), Active Deployments (billable and shadow). | v2.0 | `Live` |
| FR-DSH-004 | A **Staffing Pipeline** panel shows open requirements, positions, filled, and won and lost in 90 days, with a count and positions for each active stage. Each stage links to the pipeline. | v2.1 | `Live` |
| FR-DSH-005 | Secondary counts: Resources, Active Clients, Active Projects, Monthly Commission. | v1.0 | `Live` |
| FR-DSH-006 | **Resource Utilisation**: one bar splitting the bench into fully deployed, partially deployed and available, then up to eight resources with spare capacity, most idle first, and a link to the rest. The panel stays the same height however many people there are. | v1.0 | `Live` |
| FR-DSH-007 | **Billing by Client**: monthly billing from active billable deployments per client, largest first, with headcount. | v1.1 | `Live` |
| FR-DSH-008 | **Invoice Pipeline**: count and total, including GST, for each of the four invoice statuses. | v1.0 | `Live` |
| FR-DSH-009 | **Ending Within 30 Days**: active deployments with an end date within 30 days, and active agreements expiring within 30 days. Each shows days left, red within 7 days, or overdue or expired. | v1.0 | `Live` |
| FR-DSH-010 | **Source effectiveness**: candidates, mapped, submitted and joined for each candidate source. | v2.0 | `Live` |
| FR-DSH-011 | Every KPI has an info note giving its base and its rule. | v2.1 | `Live` |
| FR-DSH-012 | Opening the dashboard marks agreements past their end date as Expired (FSD-11, BR-AGR-02). | v1.0 | `Live` |

## 4. Business rules: KPI definitions

| KPI | How it is calculated |
|---|---|
| Open Pipeline | Sum of requirement values in the six active stages (FSD-02, BR-PIP-02). The note says how many carry a value. |
| Weighted Pipeline | The same, with each value multiplied by its stage's win probability (BR-PIP-03). |
| Won This Month | Value of requirements moved to Won since the first of this calendar month, going by stage history. |
| Win Rate | Of requirements moved to Won or Lost this month, the share that went to Won. Shows a dash if none were decided. |
| Monthly Billing | Sum of the billing amounts on active billable deployments, per currency, exactly as entered. GST (18% where it applies) is shown separately. |
| Monthly Margin | Sum of each active billable deployment's margin (FSD-10, BR-DEP-04), in INR, over those that can be computed. The note counts the non-INR deployments and those with no CTC that are excluded, and shows what shadow deployments cost. |
| Outstanding | Total, including GST, of invoices that are Raised or Pending to Collect. Overdue is the part past its due date. |
| Bench Utilisation | Resources with at least one active deployment, as a share of all resources. It counts people, not capacity: a resource at 20% counts the same as one at 100%. |
| Active Deployments | Deployments whose status is active, billable and shadow together. One person on two projects counts twice. |
| Active Clients / Projects | Clients and projects with at least one active deployment. |
| Monthly Commission | Sum of commission on active billable deployments, per currency, exactly as entered. |
| Pipeline panel: filled | Candidate mappings at Selected, Offered or Joined on requirements in an active stage. See section 9. |

## 5. Data

None of its own. The dashboard reads requirements and stage history, deployments, resources, agreements, invoices, candidates and their mappings.

## 6. Interfaces

- Reads from FSD-02, FSD-03, FSD-07, FSD-09, FSD-10, FSD-11 and FSD-12.
- Updates only one thing: agreement expiry (FR-DSH-012).

## 7. Version history

- **v1.0** (major) · 6 Sep 2026 · 3a03168 · M5  
  KPI tiles, the attention strip, the utilisation distribution with its spare-capacity list, the invoice pipeline, and Ending Soon.
- **v1.1** · 7 Sep 2026 · 087f412 · M14  
  Every money figure grouped by currency. Billing by client with headcount counted correctly across currencies.
- **v1.2** · 7 Sep 2026 · e67ec24 · M18  
  Demand KPIs: Open and Weighted Pipeline, Won This Month, Win Rate.
- **v2.0** (major) · 15 Sep 2026 · 9e78493 · M30 M40  
  Monthly Margin redefined to include salary cost and overhead. It dropped substantially when this shipped. Source effectiveness added.
- **v2.1** · 24 Sep 2026 · b77ca63 · M52 M55 — **current**  
  Panel renamed Staffing Pipeline. Info notes on every KPI. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-DSH-01 | Correct the Monthly Billing and Monthly Commission notes — Both notes say the figures are "pro-rated by allocation". The calculation sums the amounts as entered on each deployment, which is correct when a deployment's billing is already the monthly amount for that deployment. The notes should say that. | This review | High | `Proposed` |
| FS-DSH-02 | One meaning of "filled" — The Dashboard's pipeline panel counts positions with a selected, offered or joined candidate. The Pipeline screen's Filled counts Won requirements only (FSD-02). Either align the panel or relabel it, for example "candidates selected". | This review | Medium | `Proposed` |
| FS-DSH-03 | Capacity utilisation — Beside the headcount-based Bench Utilisation, show allocated capacity as a share of total capacity. | Plan M55 | Medium | `Proposed` |
| FS-DSH-04 | Trends — Every figure is a snapshot of now. Monthly history of billing, margin, utilisation and pipeline would show direction. | This review | Medium | `Proposed` |
| FS-DSH-05 | Revenue in rupees — Consolidated invoiced revenue at each invoice's stored exchange rate (FS-INV-06). | Plan M14 | Later | `Planned` |
| FS-DSH-06 | Leave out people who have left — Resources and utilisation count everyone ever added, until FS-RES-01 exists. | This review | Depends on FS-RES-01 | `Proposed` |

## 9. Known limitations

> **Two notes that do not match their figures.** (1) Monthly Billing and Monthly Commission say "pro-rated by allocation". They are not; they are the amounts as entered (FS-DSH-01). (2) "Filled" on the Dashboard's pipeline panel is not the same measure as Filled on the Pipeline screen (FS-DSH-02). Phase 15 recorded that all forty KPI definitions were checked. These two slipped through that check.

- **Margin is partial.** It covers INR deployments with a CTC only, and overhead is zero everywhere (FSD-10).
- **Deployments past their end date still count as active** until ended (FSD-10, BR-DEP-05), and inflate Active Deployments, billing and utilisation.
- **Headcount includes people who have left** (FS-RES-01).

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v2.1 | First issue, written against commit `5e43f82`. |
