# Reporting API runbook (`/api/reporting/v1`)

Operator guide for the Product Owner. Nothing here is done by the application or by an
assistant: tokens, Vercel settings, firewall rules and migrations are the Product
Owner's actions only (CLAUDE.md: production credentials stay with the PO).

## What it is
Five read-only GET endpoints for an external reporting client: `billing`, `invoices`,
`capacity`, `pipeline`, `renewals`. Bearer-token authentication with one scope per
dataset. No session cookie is read or accepted; a browser session of any role cannot
reach these paths (`lib/access.ts`), and a reporting token works nowhere else.

## Go-live gates (all must be true before the first production token)
1. **Vercel Firewall rate limit** rule on `/api/reporting/*` exists and has been seen
   enforcing. This is the control of record. The in-process limiter in the code is per
   instance and supplementary only.
2. **Kill-switch** firewall rule (block `/api/reporting/*`) is created (disabled) and has
   been tested once. Works without a deploy.
3. **Alerting** on the log event `reporting_audit_write_failed` is configured and has
   fired in a test. Until then leave `REPORTING_AUDIT_FAILURE_MODE` and
   `REPORTING_ALERTING_VERIFIED` unset: audit failure then refuses requests (503).
4. **Turso read-only token** created and set as `TURSO_READONLY_AUTH_TOKEN`; confirmed it
   cannot write.
5. `npm run db:migrate` run on the production database **before** the code deploys
   (adds `reporting_audit_log`).
6. D6 confirmed with Accounts (how a split engagement's `billing_amount` is entered).
7. Third-party processing policy agreed for the commercial data the client will see.

## Issue a token
```bash
TOKEN="rpt_$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
printf '%s' "$TOKEN" | shasum -a 256 | cut -d' ' -f1     # the hash for REPORTING_TOKENS
```
Give `$TOKEN` to the consumer once; store only the hash. Add an entry to
`REPORTING_TOKENS` (Vercel env, production), with a label (`id`), the smallest set of
`scopes`, and `expires` (90 days recommended). Redeploy.

## Rotate
Add the new entry (both valid), redeploy, switch the consumer, remove the old entry,
redeploy. Never reuse an `id`.

## Revoke
Remove the entry and redeploy (minutes). Immediately, with no deploy: enable the
kill-switch firewall rule.

## Watching it
* Authenticated requests: table `reporting_audit_log` (token id, endpoint, status, row
  count, timing, validated params; no token, body or address).
* **Denied requests are not in the table.** Missing/invalid/expired tokens, wrong scope
  and wrong method are refused by the Edge gate, which has no database, and appear only
  as log lines `reporting_gate_denied`. Firewall-blocked requests appear only in the
  platform firewall log. Check Vercel log retention for how long that history lasts.
* Audit failures: `reporting_audit_write_failed` (error) with a
  `reporting_audit_fallback` line holding what the row would have contained.

Retention (operator-run, nothing in the app deletes audit rows), e.g. 180 days:
```sql
DELETE FROM reporting_audit_log WHERE created_at < datetime('now', '-180 days');
```

## Behaviour to know
* Dates are Asia/Kolkata calendar dates. Results may be up to 60 s old (per-instance cache);
  `meta.generatedAt` says when they were computed.
* Money is per currency and never converted. `billing` is contracted, not invoiced.
  `markedCollected` is a status, not a verified cash receipt.
* Errors: 401 unauthorized, 403 insufficient_scope, 404 not_found, 405 method_not_allowed,
  422 invalid_parameter, 429 rate_limited, 503 data_unavailable / audit_unavailable,
  500 internal_error.
