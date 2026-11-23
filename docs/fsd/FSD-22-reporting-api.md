# FSD-22 Reporting API (read-only)

| Field | Value |
|---|---|
| Module | Reporting API, `/api/reporting/v1` |
| Version | 1.0 (local/test implementation; not deployed) |
| Status | `Built, awaiting Product Owner review` |
| Plan | `docs/plans/2026-11-23-reporting-api-v1.md` (Revision 3 authoritative) |
| Runbook | `docs/reporting-api/runbook.md` · contract `docs/reporting-api/openapi.yaml` |

## Revisions
| Rev | Date | Change |
|---|---|---|
| 1.0 | 23 Nov 2026 | Five read-only datasets (billing, invoices, capacity, pipeline, renewals), bearer-token boundary, append-only audit table |

## Built (FR)
* FR-RPT-001 Bearer tokens (hashes in `REPORTING_TOKENS`), one scope per dataset, expiry mandatory.
* FR-RPT-002 Fail-closed boundary: Edge gate + handler re-verification + session deny in `lib/access.ts`; cookies ignored.
* FR-RPT-003 GET only; reporting queries use a read-only client and never write business tables; one audit INSERT per authenticated request; audit failure fails closed unless alerting is verified.
* FR-RPT-004 Field allowlists; no CTC, contacts, candidate data, budgets or free text.
* FR-RPT-005 Per-currency figures, never converted; contracted (billing) kept apart from invoiced (invoices); collected is a status.
* FR-RPT-006 Asia/Kolkata calendar dates.
* FR-RPT-007 Renewal exposure counts agreement chain heads once; capped and uncapped fulfilment named separately.

## Open (FS)
* FS-RPT-001 D6: confirm with Accounts how a split engagement's billing amount is entered.
* FS-RPT-002 Production gates in the runbook: firewall rate limit and kill switch, alerting, read-only Turso token, migration, third-party processing policy.
* FS-RPT-003 Phase 2: margin reporting, lead-generation attribution, pipeline value.
