# Read-only Reporting APIs (`/api/reporting/v1`) — Revision 3 (targeted corrections to Revision 2)

Planning only. Nothing has been created, changed, migrated or deployed. Awaiting Product Owner approval (CLAUDE.md "plan before you build"). The five API contracts (§10) and the approved Phase 1 data restrictions are **unchanged**. Where this section contradicts §§1–15, this section wins.

## R3. Revision 3 — confirmed findings and required changes

### R3.1 Confirmed engineering findings
1. **`lib/queries.ts` uses the normal client directly.** It does `import { db, type Executor } from './db'` (line 4) and the five KPI functions Revision 2 proposed to reuse (`getBillingByClient`, `getInvoiceSummary`, `getPipelineSummary`, `getExpiringAgreements`, `getEndingSoon`) call the module-level `db` with **no executor parameter**. Only two allocation helpers (`getResourceAllocation`, `assertAllocationHeadroom`) accept an `Executor`. Importing `lib/queries.ts` also pulls the global write-capable `db` and `syncExpiredAgreements()` into the reporting module graph. Revision 2's statement that a read-only client would serve "business queries" was therefore **not achievable if those functions are called**.
2. **Pure helpers are safe to share.** `lib/utils.ts` imports only `clsx` and `tailwind-merge`: `sumByCurrency`, `isInvoiceOverdue`, `today`, `daysBetween`, `addDays` carry no database access.
3. **Edge and platform logs cannot be database audit.** The gate runs on the Edge without a database, so denials there never reach the audit table (R3.2).
4. **Authentication and scope checks run before any cache lookup** in the design, but Revision 2 did not state the cache-key contents or an invariant; this is now explicit (R3.4).

### R3.2 Required change 1 — SELECT-only enforcement without refactoring unrelated modules
- `lib/queries.ts` is **not edited and not imported** by reporting code. This removes the earlier `export FILLED_STATUSES` change.
- Reporting owns its queries in `lib/reporting/*.ts`, built on a reporting-only client `lib/reporting/readonly-db.ts` (libSQL + Drizzle, authenticated with `TURSO_READONLY_AUTH_TOKEN`; falls back to the normal URL on a local file DB, where only the static and integration tests enforce it).
- "Reuse" now means: (a) reuse of the **pure helpers** above; (b) the existing functions are the **specification and test oracle**. Each reporting query is verified by a parity test that runs the original function and the reporting query against the same scratch database and asserts equal figures. This is deliberate duplication of ~5 small SQL aggregates, in exchange for a database-enforced guarantee. The PO should confirm this trade-off (blocker B5).
- `FILLED_STATUSES` is defined in `lib/reporting/pipeline.ts` as `['selected','offered','joined']`; a parity test against `getPipelineSummary().filledPositions` fails if the two ever diverge.
- Only `lib/reporting/audit.ts` may import `@/lib/db` (needed for the single audit INSERT). Static test: no other file under `lib/reporting/**` or `app/api/reporting/**` may import `@/lib/db`, `@/lib/queries`, `@/lib/session` or `@/lib/accounts/*`.
- If Turso read-only tokens are unavailable (blocker B3), the guarantee falls back to the static, parity and row-count tests, and the plan states that the database layer is absent.

### R3.3 Required change 2 — what is recorded where
| Event | Where it happens | Recorded in |
|---|---|---|
| Missing/malformed/unknown/expired token, wrong scope (403), non-GET (405), unknown path under the prefix | Edge gate, no database | **Edge runtime log line only** (`console.log` JSON: event code, path, method, request id, token **id** only when a valid token matched; never token material). Not in the audit table |
| Firewall blocked or rate-limited requests | Vercel Firewall, before the app runs | **Vercel firewall/platform logs only** |
| Route re-verification failure (should be unreachable) | Handler | Server error log, loud; not the audit table |
| Authenticated request that reached the handler: 200, 422, 429 (process throttle), 503, 500 | Handler | `reporting_audit_log` row (token id, endpoint, status, row count, duration, allowlisted params), best effort |
| Audit write failure | Handler | Server log + fallback record (R3.5) |

Consequences, stated plainly: the audit table does **not** show failed-authentication or brute-force attempts, and does not contain every denial. Detecting those depends on Vercel log retention and search, which must be verified (blocker B2). `REPORTING_AUDIT=log` removes the table and puts authenticated-request records in the same platform logs.

### R3.4 Required change 3 — throttling is supplementary
- The in-process token bucket is **per instance, best effort, and not a security boundary**. Serverless scale-out, cold starts and region distribution mean it can be exceeded or reset at any time.
- **Production dependency:** the Vercel Firewall rate-limit rule on `/api/reporting/*` (and the kill-switch block rule) is the control of record. Production tokens **must not be issued** until the PO has verified the plan offers these rules, configured them, and observed a limit being enforced. This is recorded as blocker B2 and as a go-live gate.
- Documentation (`runbook.md`, `openapi.yaml` description, CLAUDE.md note) states the dependency and that the in-process limiter is not relied on.

### R3.5 Required change 4 — memoisation keys and ordering
- **Order, always:** Edge gate (verify + scope) → handler re-verification (verify + scope) → Zod validation → throttle → **cache lookup** → compute. A cache entry is never consulted, created or returned before both authentication and scope checks have passed on the current request. A revoked or wrong-scope token receives 401/403 even when the entry is warm.
- **Key** = `endpoint | schemaVersion | canonical JSON of every validated parameter after defaults are applied` — i.e. all of `currency, client_id, as_of (resolved date), from, to, window_days, lapsed_within_days, stage, include_terminal, min_free, limit, offset` that the endpoint accepts, sorted by name. Applying defaults first makes default and explicit values share an entry; resolving `as_of` makes entries roll over at midnight UTC. Unvalidated input is never part of a key.
- **Entitlement boundary:** in Phase 1 a scope grants an entire dataset and no token has row-level filters (no per-client restrictions), so the result is identical for every token holding the scope and the token id is deliberately **not** in the key. Invariant, enforced by a test: **if a per-token filter or restriction is ever added, it must be added to the key in the same change**; the cache stores only the mapped, allowlisted payload and `computedAt`, never a raw row or an envelope.
- TTL 60 s, max 200 entries, per instance. `meta.generatedAt` reports `computedAt`.

### R3.6 Required change 5 — audit-write failure handling, logging and alerting
- **Behaviour (D12, needs PO confirmation):** fail open — serve the response — because Phase 1 data is aggregate-only and an audit outage should not take reporting down. The insert is bounded by a 1.5 s timeout and counted as a failure if it exceeds it.
- **Observable logging, always:** one structured `console.error` JSON line per failure, `event: "reporting_audit_write_failed"`, with `requestId, tokenId, endpoint, status, errorClass` and no payload, params values beyond the allowlist, or token material. In the same step a **fallback record** is emitted as `event: "reporting_audit_fallback"` containing the fields the row would have held, so the event survives in platform logs for as long as they are retained.
- **Alerting requirement:** an alert must fire on `reporting_audit_write_failed` (proposed: any occurrence in 10 minutes pages the PO; three or more in 10 minutes is an incident). HANDOVER §3 records that no error monitoring exists, so the mechanism is a **PO decision and a go-live gate** (blocker B4): Vercel's own alerting or a log drain if the plan supports it, otherwise a documented daily log search as an explicit, time-limited stopgap. **If no alert path exists, the default flips to fail closed (`503 audit_unavailable`)**, because unobserved fail-open means silent audit loss.
- Tests: audit failure keeps the response and emits both log events (spy on `console`), timeout path, fail-closed mode returns 503 and writes no business data, log lines contain no token material or response bodies.

### R3.7 Updated file-by-file plan (replaces §13)
| File | Change |
|---|---|
| `middleware.ts` | First branch: `/api/reporting` → `reportingGate` (Edge, logs denials per R3.3). `PUBLIC_*` untouched |
| `lib/access.ts` | Deny `/api/reporting` for every role in `canAccess` and `canWrite` |
| `lib/ddl.ts`, `lib/schema.ts` | One table `reporting_audit_log` + index (omitted when `REPORTING_AUDIT=log`) |
| `lib/reporting/verify.ts`, `gate.ts` | Bearer verification (Web Crypto); Edge gate, path→scope table, denial log lines |
| `lib/reporting/handler.ts` | Re-verify, params, throttle (supplementary), cache after auth, errors, headers |
| `lib/reporting/audit.ts` | **Only file importing `@/lib/db`**; one INSERT with 1.5 s bound; failure and fallback logging; `REPORTING_AUDIT` mode |
| `lib/reporting/readonly-db.ts` | Read-only client; every reporting query uses it |
| `lib/reporting/memo.ts`, `throttle.ts`, `params.ts`, `types.ts`, `aging.ts` | As before; memo key per R3.5 |
| `lib/reporting/{billing,invoices,capacity,pipeline,renewals}.ts` | **Own queries** on the read-only client + allowlist mappers; `FILLED_STATUSES` defined here; parity-tested against the original functions |
| `app/api/reporting/v1/*/route.ts` (5) | `GET` only |
| `tests/chokepoints.test.ts` | Reporting rule (`reportingHandle(`, GET only, no `handle(`/session) |
| New tests | `lib/reporting/*.test.ts`, `tests/reporting-gate.test.ts`, `tests/reporting-integration.test.ts` (adds: parity tests, cache-after-auth tests, key-completeness test, audit-failure tests, import-ban static test) |
| `.env.example` | Names only: `REPORTING_TOKENS`, `REPORTING_AUDIT`, `TURSO_READONLY_AUTH_TOKEN` |
| Docs | `openapi.yaml`, `runbook.md` (issue/rotate/revoke, kill switch, firewall dependency, alerting), FSD + revision rows, `docs/plans/`, README note, CLAUDE.md invariant |
| **Not changed** | `lib/queries.ts` (no longer edited or imported), `package.json`, any existing module |

### R3.8 Remaining approval and verification blockers
| ID | Blocker | Owner | Gates |
|---|---|---|---|
| B1 | **D6** `billing_amount` semantics: Accounts confirmation + diagnostic | PO / Accounts | Final `/billing` figures |
| B2 | Vercel plan: firewall rate-limit and kill-switch rules, keying, log retention and search for denial events. **Go-live gate** | PO | Production tokens |
| B3 | Turso read-only token support (else database-level SELECT-only is absent) | PO | Layer-1 guarantee |
| B4 | Approve W1 (single audit INSERT) or `REPORTING_AUDIT=log`; confirm D12; **choose the alerting mechanism** (else fail closed) | PO | Audit design, go-live |
| B5 | Approve reporting-owned queries with parity tests instead of calling `lib/queries.ts`; approve edits to `middleware.ts`, `lib/access.ts` and the chokepoint test rule | PO | Build start |
| B6 | Third-party processing policy for commercial data (D1, D3) | PO | Go-live |

---

# Revision 2 (retained; superseded where R3 says so)

## 0. What changed from Revision 1

| # | Review finding | Revision 2 response |
|---|---|---|
| 1 | `PUBLIC_PREFIXES` exemption removes the session gate and the chokepoint test | **Withdrawn.** Dedicated fail-closed reporting gate in middleware + route-level re-verification + a session deny rule in `lib/access.ts` (§2) |
| 2 | "Read-only" was loose | Precise definition and one enumerated write exception, with four enforcement layers (§3) |
| 3 | DB-backed rate limit | **Withdrawn.** Platform firewall rule + in-process throttle + short result memoisation; no DB counters (§4) |
| 4 | Two tables + scripts | **Reduced to one append-only audit table, no token table, no scripts.** Tokens are environment-managed hashes (§5, comparison) |
| 5 | `billing_amount` semantics | Evidence gathered; provisional answer and a verification gate (§6, D6) |
| 6 | Capped vs uncapped fills | Three differently named measures (§7) |
| 7 | Successor double counting | Chain-head rule (§8) |
| 8 | D1–D11 | Defaults adopted in a table; D6 flagged (§9) |
| 9 | Deliverables | Architecture §2, files §10, threats §11, tests §12, blockers §13 |

---

## 1. Discovery findings (unchanged facts, plus new ones)

- Auth today is a session cookie only. `middleware.ts` verifies it on the Edge; `lib/access.ts` `canAccess()` returns `true` for **every** path for `admin` and `management` (`lib/access.ts:242`). Any new `/api/reporting/*` route would therefore be reachable by an admin session unless it is explicitly denied.
- `handle()` (`lib/api.ts`) returns `err.message` on 500 and runs the session account check: wrong for a machine client. Reporting needs its own wrapper.
- `tests/chokepoints.test.ts` exempts anything in `PUBLIC_*`. Non-public routes must contain `handle(`/`getSession(`/`getSessionState(`.
- `/api/dashboard/summary` calls `syncExpiredAgreements()` (an UPDATE). Reporting must never call it.
- Reusable, side-effect-free: `getBillingByClient`, `getInvoiceSummary`, `getPipelineSummary`, `getExpiringAgreements`, `getEndingSoon`, plus `isInvoiceOverdue`, `sumByCurrency`, `today`, `daysBetween`, `addDays` (`lib/utils.ts`). `getResourceUtilisation` selects CTC, so it is **not** returned; a reporting query replaces it and a parity test ties the two.
- `FILLED_STATUSES = ['selected','offered','joined']` is module-private in `lib/queries.ts:578`.
- No `.vercel/` directory, no `vercel.json`, no cron, no rate limiting anywhere (HANDOVER §3).

---

## 2. Revised architecture: a reporting authentication boundary that fails closed

### Principles
1. Reporting requests and session requests never share an auth path. A cookie is never an input to reporting; a bearer token is never an input to anything else.
2. **Deny by default at three independent layers.** Any one of them is enough to stop a session from reaching reporting data.
3. Authentication needs no database (so invalid tokens cost nothing downstream).

### Layers

**Layer 1 — middleware gate (first branch in `middleware.ts`, before session logic).** Every path equal to `/api/reporting` or starting with `/api/reporting/` is handled **only** by `reportingGate(req)` (Edge-safe, in `lib/reporting/gate.ts`, Web Crypto only) and returns before the cookie is read:
- Method must be `GET`, else 405 (HEAD/OPTIONS/POST/etc. rejected).
- Requires `Authorization: Bearer rpt_…`; token verified against the environment token list (§5): SHA-256, constant-time comparison across all entries, expiry, scope-for-path (path→scope table; unknown path under the prefix → 401 before 404, so the namespace is not enumerable).
- Forwards the request with the `Cookie` header **removed** and any inbound reporting marker header stripped, then sets its own marker (same pattern as `SIGNED_IN_HEADER`).
- Malformed or missing configuration → every request 401 and a loud server log. The gate never falls through to the session code.

**Layer 2 — route-level re-verification (`reportingHandle`).** Does not trust the marker alone: it re-runs the same pure `verifyBearer()` function in the Node runtime. If someone edits the middleware matcher or removes the gate, routes still refuse unauthenticated requests. A session cookie is unreadable here because `reportingHandle` never imports `lib/session.ts`.

**Layer 3 — policy deny in `lib/access.ts`.** `canAccess(role, p)` and `canWrite(role, p)` return `false` for `/api/reporting` for **all** roles including admin and management, checked first. If the gate branch were ever refactored away, a session request would be rejected by the existing session path (403). `PUBLIC_PREFIXES` and `PUBLIC_EXACT` are **not touched**.

**Reverse isolation:** the session path ignores `Authorization` entirely, so a reporting token on `/api/invoices` etc. gets 401.

```
GET /api/reporting/v1/* ──► middleware: reportingGate (no cookie, no DB)
                              └─ 401/403/405 or forward (cookie stripped)
                          ──► route: reportingHandle
                              ├─ verifyBearer again (fail closed)
                              ├─ Zod strict params → 422
                              ├─ in-process throttle → 429
                              ├─ memoised read (≤ 60 s) via read-only DB client → mapper (allowlist)
                              ├─ audit: one INSERT (or log line) — best effort
                              └─ envelope, Cache-Control: no-store
Any other path ──► existing session gate and role policy, unchanged
```

### Fail-closed behaviour matrix
| Situation | Result |
|---|---|
| No header, wrong scheme, malformed, unknown, expired, revoked-by-removal token | Identical `401`, `WWW-Authenticate: Bearer` |
| Valid token, scope not granted for this endpoint | `403 insufficient_scope` |
| `REPORTING_TOKENS` missing or invalid JSON | All reporting requests `401`, server error logged; rest of app unaffected |
| Admin/management session cookie, no bearer | `401` (cookie ignored) |
| Admin cookie plus valid bearer | Same response as bearer alone; no elevated behaviour |
| Database unavailable | `503 data_unavailable` + `Retry-After`; never serves stale beyond memo TTL |
| Audit write fails | Request still served; failure logged (see §3, decision D12) |

---

## 3. "Read-only", defined precisely

**Definition.** A reporting request executes only `SELECT` statements against **business tables** (every table except the audit table below), calls no function that mutates, and has no side effect on any other path's state.

**Permitted exception W1 (requires explicit PO approval).** Exactly one append-only `INSERT` into a new table `reporting_audit_log` per request. No `UPDATE` or `DELETE` of any table from reporting code. No token table, no `last_used_at`, no counters.

**Explicitly forbidden:** `syncExpiredAgreements()`, any `.insert/.update/.delete/.run` outside `lib/reporting/audit.ts`, any route export other than `GET`, any call into `lib/accounts/*`.

**Enforcement, four layers**
1. **Database-level (defence in depth, to verify):** business queries use a second libSQL client authenticated with a **read-only Turso token** (`TURSO_READONLY_AUTH_TOKEN`). Even a coding mistake cannot write a business table. Only `audit.ts` uses the normal client. Local file databases have no such token, so layers 2–4 carry local and CI proof. **Applies only because reporting owns its queries (see R3.2); `lib/queries.ts` functions use the global client and are not called.**
2. **Static test:** scan of `lib/reporting/**` and `app/api/reporting/**` bans mutating Drizzle/SQL verbs except in `audit.ts`, and bans importing `lib/queries.ts` functions on a deny-list (`syncExpiredAgreements`).
3. **Integration test:** row-count and checksum snapshot of every table before/after calling all five endpoints and every error path; only `reporting_audit_log` may grow, by exactly one row per call. A fixture with an `active` agreement past its end date must remain `active`.
4. **Review rule:** W1 is the only write; adding another requires a new approval.

If the PO declines W1, set `REPORTING_AUDIT=log`: structured JSON lines to the platform log, no table, strictly zero writes.

---

## 4. Rate limiting and DoS, re-evaluated

**Why DB counters were wrong.** (a) *Concurrency:* count-then-insert is racy, so a burst exceeds the limit. (b) *DoS:* every rejected or unauthenticated request still costs a DB read and write, so the limiter itself becomes the amplification point. (c) *Failure:* if Turso is slow or down, the limiter must either fail open (no protection) or fail closed (outage). (d) Cost on every call.

**Layered design, no new infrastructure**
| Layer | Mechanism | Strength |
|---|---|---|
| L1 Platform | **Vercel Firewall rate-limit rule** on `/api/reporting/*` (per IP, plus per header value if the plan supports it), and a block rule as an **instant kill switch** with no deploy. Rules run before the function is invoked, so abusive traffic costs no compute and no DB | Hard, shared across instances. **Plan availability and keying must be verified (blocker B2)** |
| L2 Authentication | Environment tokens verified in memory; invalid tokens never touch the DB | Removes the amplification vector |
| L3 Process | Small per-instance token bucket keyed by token id (default 30/min) | Soft, per instance; absorbs bursts the firewall lets through |
| L4 Memoisation | Per-instance cache of the final mapped result keyed by `endpoint + validated params`, TTL 60 s, bounded size (e.g. 200 entries), populated only after the scope check | Caps DB load at ≈ one query set per instance per key per minute regardless of request rate. `meta.generatedAt` tells the truth about staleness |
| L5 Query bounds | `limit ≤ 500`, date windows capped (invoices ≤ 24 months, renewals ≤ 365 days), ≤ 5 queries per endpoint, no unbounded joins | Bounds worst-case cost |

Database failure: reads return `503 data_unavailable`; memoised results are not served after TTL; the audit insert is skipped and logged. No daily quota in Phase 1 (needs shared state); the firewall rule can express an hourly cap if supported.

---

## 5. Token design: why one table, no token table, no scripts

| Criterion | A. Revision 1 (token table + log table + CLI) | B. Environment-managed hashes only | **C. Recommended: B + one audit table** |
|---|---|---|---|
| New schema | 2 tables, migration, migrate-before-deploy ordering | None | 1 append-only table (or none with `REPORTING_AUDIT=log`) |
| Auth cost | DB read per request (amplification) | In-memory, Edge-capable | In-memory, Edge-capable |
| Writes on read path | Audit insert **and** `last_used_at` update | None | One audit insert (W1), optional |
| Revocation | Instant (row flag) | Remove entry + redeploy (minutes); **instant kill switch via firewall rule** | Same as B |
| Scope change | Instant | Env edit + redeploy | Same as B |
| Rotation | Script | Two entries overlap; redeploy twice | Same as B |
| Auditing | Durable, queryable | Platform runtime logs only; short retention, not queryable | Durable, queryable by token **id** |
| Last-used tracking | Yes | No | Derivable from audit log |
| Operational surface | CLI to maintain, secure and run against production | `openssl`/`shasum` runbook, no code | Same as B |
| Blast radius if DB read leaks | Token hashes | Nothing | Audit rows (ids, endpoints, params) |
| Who can create tokens | Whoever can run the script with prod creds | Whoever can edit Vercel env (PO only, matches CLAUDE.md) | Same |

**Recommendation: C.** It keeps authentication independent of the database (fail-closed, Edge-verifiable, no amplification), needs no migration for tokens or CLI to defend, and keeps the one thing logs cannot give us: durable audit. Its cost is that revocation and scope changes need a redeploy, mitigated by the firewall kill switch.

**Token format.** `rpt_` + 32 random bytes base64url (generated by the PO with `openssl rand`). The environment holds only SHA-256 hashes:
`REPORTING_TOKENS=[{"id":"gpt-sales-2026-11","sha256":"…","scopes":["billing","invoices"],"expires":"2027-02-21"}]`
Scopes: `billing | invoices | capacity | pipeline | renewals` (one per endpoint; no wildcard). `expires` mandatory; entries without it, with past dates, duplicate ids or unknown scopes are rejected at load. Plaintext exists only at issue time and in the consumer. Only the token **id** is ever logged.

---

## 6. `billing_amount` allocation semantics (D6, needs verification)

**Evidence found in the repository**
- Form label: "Billing Amount (₹/month)", entered per deployment (`app/deployments/client.tsx:862`); validation only requires > 0 (`lib/validations.ts`), no relation to allocation.
- Seed data, split resource 2: 60% → 198,000 and 40% → 132,000. Dividing by allocation gives **330,000 for both** (198,000 / 0.6 and 132,000 / 0.4), i.e. the amounts are already each deployment's share of one full rate. Resource 4: 80% → 232,000 (= 290,000 full). Resource 7: 50% → 96,000 (= 192,000 full).
- `deploymentMoney()` pro-rates **only** the CTC by allocation (`lib/utils.ts:506`) and subtracts the **unweighted** billing amount. If billing were a full-time rate, margin would double-count cost.
- `getBillingByClient` and `getDashboardSummary` sum `billing_amount` unweighted.

**Provisional rule.** `billing_amount` is the amount for that deployment as entered; **do not multiply by `allocation_percentage`** and do not divide. Reporting sums it as the dashboard does, per currency.

**Status: provisional until verified.** Seed data is the developers' own illustration, not proof of how Accounts enter real splits. Verification steps, all read-only:
1. PO confirms with Accounts how a split engagement is entered (full rate × share, or already the share).
2. Diagnostic on the **test** database (and by the PO on production, aggregates only): for resources with two or more active billable deployments, compare each `billing_amount / allocation_percentage` across their deployments; equal ratios support the rule.
3. A fixture test locks the rule (60/40 split sums to the full rate, not 1.0×).
4. Cross-check with `agreement_resources.billing_amount` where a PO exists.

Until step 1 is confirmed, `/billing` ships with `meta.notes` stating the assumption, and the figure is not presented as final.
Note: contracted deployment billing and invoice lines (`invoice_resources.monthly_rate`, pro-rated by days) are independent measures; they are not expected to reconcile one-to-one.

---

## 7. Pipeline: capped fills versus uncapped mappings

Three measures, three names, never interchangeable:

| Field | Definition | Counting unit | Source |
|---|---|---|---|
| `mappedCandidates` (per stage, per status) | All mappings at each of the nine candidate statuses, including rejected/withdrawn | Mappings (a person mapped to two requirements counts twice) | `opportunity_candidates` grouped by status |
| `mappingsInFilledStatus` | Mappings with status `selected`, `offered` or `joined` on open-stage requirements. **Uncapped.** Equals the dashboard's `filledPositions`, which is therefore a misnomer | Mappings | `getPipelineSummary().filledPositions` (reuse) |
| `filledPositions` | Per open requirement `min(mappings in filled statuses, required_count)`, summed | Positions | New query in `lib/reporting/pipeline.ts` |
| `unfilledPositions` | `Σ(required_count) − filledPositions` on open requirements | Positions | derived |
| `fulfilmentPct` | `filledPositions / Σ required_count`, `null` when no open positions | Ratio | derived |

Invariant tested: `filledPositions ≤ mappingsInFilledStatus` and `filledPositions ≤ openPositions`; equality only when no requirement is over-filled. `meta.notes` explains the difference. `FILLED_STATUSES` is defined in `lib/reporting/pipeline.ts` and parity-tested (R3.2); `lib/queries.ts` is not edited.

---

## 8. Renewals: no double counting of original and successor agreements

Renewal inserts a new row with `parent_agreement_id` and marks the parent `renewed` (`app/api/agreements/[id]/renew/route.ts`). `getAgreementChain()` already walks parent and child.

**Chain-head rule.** Renewal exposure counts only **chain heads**: agreements with no row whose `parent_agreement_id` equals their id. Each chain contributes at most one row and one `value`; values are never summed across versions (`value` is per version, not cumulative).

| Case | Treatment |
|---|---|
| Head, `active`, `end_date` in window | `expiring`, counted in exposure buckets |
| Head, `active` or `expired`, `end_date < as_of`, within `lapsed_within_days` (default 90) | `lapsed`, in the `lapsed` bucket |
| Non-head (has a successor), any status | **Excluded from exposure.** Reported only as `alreadyRenewed` count if its `end_date` falls in the window (it is covered by its successor) |
| Successor | Counted on its own `end_date`/`value` once it is the head |
| Data inconsistency: parent still `active` but a child exists | Treated as superseded; counted in `dataQuality.supersededButActive`, never in exposure |

Exposure is a **contract value** per currency by expiry bucket; deployment monthly billing ending is a separate measure with its own label and is never added to it. Derived `lapsed` is computed from dates, not from the stored `expired` status, because that status is only written by the dashboard route's sync.

Tests: single agreement; two-version chain with the original ending in the window (excluded, `alreadyRenewed = 1`); three-version chain (only v3 counted); parent `active` with child (dataQuality); sum of `value` across the chain is never reported; two currencies.

---

## 9. Decisions D1–D11 (defaults adopted)

| ID | Decision | Default adopted | Status |
|---|---|---|---|
| D1 | Consumer | ChatGPT custom GPT Action via OpenAPI 3.1; MCP deferred | Proposed default |
| D2 | Token lifetime and issuer | 90 days, expiry mandatory; Product Owner is the only issuer | Proposed default |
| D3 | Client names in output | Included (`clientId` + `clientName`) | Proposed default |
| D4 | Capacity detail | Aggregates only; no per-resource rows, names or designations | Proposed default |
| D5 | Invoice/agreement numbers | Excluded in Phase 1 | Proposed default |
| **D6** | `billing_amount` allocation semantics | Already the deployment's share; sum unweighted | **Requires repository and test-data verification (§6) before `/billing` figures are called final** |
| D7 | Fulfilment | Capped per requirement, with the uncapped figure named separately (§7) | Proposed default |
| D8 | Budget/deal value | Excluded; Phase 2 under its own scope | Proposed default |
| D9 | Client IP in audit | Not stored (firewall logs hold it) | Proposed default |
| D10 | Limits | Firewall: 60 req/min per IP; process throttle 30/min per token id; no daily quota | Proposed default (revised) |
| D11 | Audit retention | 180 days, purge by an operator-run SQL statement (no app code deletes) | Proposed default |
| D12 (new) | Audit failure | Fail open (serve, log the failure) because data is aggregate-only; PO may choose fail closed | Needs PO confirmation |

---

## 10. API specifications (envelope, errors, five endpoints)

**Envelope** (all endpoints)
```ts
interface Envelope<T> {
  meta: { version: 'v1'; generatedAt: string; asOf: string; scope: string;
          currencyPolicy: 'per-currency, never converted';
          params: Record<string, string | number | boolean>;
          pagination?: { limit: number; offset: number; total: number; truncated: boolean };
          notes: string[] };
  data: T;
}
type Currency = 'INR' | 'AED' | 'USD';
type MoneyByCurrency = { currency: Currency; amount: number }[];
```
**Errors:** `{ error: { code, message, details? } }` — 401 `unauthorized`, 403 `insufficient_scope`, 405 `method_not_allowed`, 422 `invalid_parameter` (unknown keys rejected), 429 `rate_limited` (+`Retry-After`), 503 `data_unavailable`, 500 `internal_error` (generic text only). All responses `Cache-Control: no-store`, no CORS headers.
**Common params:** `limit` 1–500 (default 100), `offset` ≥ 0 where a list exists. Every mapper builds objects field by field (allowlist).

### 10.1 `GET /billing` — scope `billing` (contracted, not invoiced)
Params: `currency?`, `client_id?`, `limit`, `offset`. Sources: `deployments` ⋈ `projects` ⋈ `clients` (active, billable). Reuse `getBillingByClient()`; add per-client deployment and project counts in one grouped query. `totals.billedResources` is a distinct count, not a sum of client counts. Subject to D6 note.
```ts
interface BillingReport {
  totals: { contractedMonthly: MoneyByCurrency; activeBillableDeployments: number; billedResources: number };
  clients: { clientId: number; clientName: string; contractedMonthly: MoneyByCurrency;
             activeBillableDeployments: number; projects: number; billedResources: number }[];
}
```
Excluded: per-deployment or per-resource rows, commission, overhead, GST detail.

### 10.2 `GET /invoices` — scope `invoices`
Params: `as_of?` (default today, not in the future), `from?`/`to?` on `invoice_date` (≤ 24 months), `client_id?`, `currency?`, `limit`, `offset`. Basis `amount + gst_amount` (matches `getInvoiceSummary`), with ex-GST and GST also given. *Invoiced* = raised, pending_collection, collected; *notRaised* reported separately; *outstanding* = raised + pending_collection; *overdue* = outstanding with `due_date < as_of`; `markedCollected` is **a status, not verified cash receipt**. Aging buckets by days past due: `notYetDue, 1–30, 31–60, 61–90, 90+, noDueDate` (pure `lib/reporting/aging.ts`). Reuse `getInvoiceSummary` as the reconciliation target, `isInvoiceOverdue`, `sumByCurrency`. No invoice numbers (D5), notes, lines, resource ids or FX rate.
```ts
interface InvoicesReport {
  totals: { invoiced: MoneyByCurrency; notRaised: MoneyByCurrency; outstanding: MoneyByCurrency;
            overdue: MoneyByCurrency; markedCollected: MoneyByCurrency; overdueCount: number };
  aging: { currency: Currency; notYetDue: number; d1_30: number; d31_60: number; d61_90: number; d90plus: number; noDueDate: number }[];
  clients: { clientId: number; clientName: string; currency: Currency; invoiced: number; outstanding: number;
             overdue: number; markedCollected: number; invoiceCount: number; oldestOverdueDays: number | null }[];
}
```

### 10.3 `GET /capacity` — scope `capacity`
Params: `min_free?` (0–100, default 1), `limit`, `offset` (for `bySkill`). Population: `resources` with `exit_date IS NULL` (same rule as `getResourceUtilisation`). Allocation from active `deployments`: billable%, shadow%, free = `max(0, 100 − total)`. No bench entity is invented; no bench-since dates; no CTC column is selected. Aggregates only (D4).
```ts
interface CapacityReport {
  headcount: number;
  allocation: { billablePct: number; shadowPct: number; freePct: number };
  utilisationPct: number;  // Σ billable% / (100 × headcount)
  bench: { fullyBench: number; partiallyAvailable: number; fullyAllocated: number; shadowOnly: number; availableFte: number };
  bySkill: { primarySkill: string | null; headcount: number; availableFte: number; fullyBench: number }[];
}
```

### 10.4 `GET /pipeline` — scope `pipeline`
Params: `client_id?`, `stage?` (nine stages or `open`), `include_terminal?` (default false), `limit`, `offset`. Reuse `getPipelineSummary()` for `byStage`, `openCount`, `openPositions`, won/lost 90 days, on-hold, follow-ups due. Counts only; no candidate identity, JD, owners, share tokens, budgets or deal values.
```ts
interface PipelineReport {
  byStage: { stage: OpportunityStage; requirements: number; positions: number;
             mappedCandidates: Record<CandidateStatus, number> }[];   // mappings, §7
  open: { requirements: number; positions: number;
          filledPositions: number;          // capped per requirement
          unfilledPositions: number; fulfilmentPct: number | null;
          mappingsInFilledStatus: number }; // uncapped, = dashboard "filledPositions"
  closedLast90d: { won: number; lost: number }; onHold: number; followUpsDue: number;
  byClient?: { clientId: number; clientName: string; openRequirements: number; openPositions: number; filledPositions: number }[];
}
```

### 10.5 `GET /renewals` — scope `renewals`
Params: `window_days?` (1–365, default 90), `lapsed_within_days?` (0–365, default 90), `client_id?`, `limit`, `offset`. Chain-head rule (§8). Reuse `getExpiringAgreements`/`getEndingSoon` through mappers (resource names dropped) plus one successor query. Deployment ends: active deployments with `end_date` in window, `openEnded` count (no end date), contracted monthly billing ending per currency.
```ts
interface RenewalsReport {
  agreements: {
    chainHeads: number; expiring: number; lapsed: number; alreadyRenewed: number;
    exposureByBucket: { bucket: '0-30'|'31-60'|'61-90'|'91+'|'lapsed'; count: number; contractValue: MoneyByCurrency }[];
    items: { agreementId: number; clientId: number; clientName: string; projectName: string; title: string; currency: Currency;
             value: number; endDate: string; daysToExpiry: number; state: 'expiring'|'lapsed';
             renewalVersion: number }[];
    dataQuality: { supersededButActive: number };
  };
  deployments: { endingInWindow: number; openEnded: number; monthlyBillingEnding: MoneyByCurrency;
                 byBucket: { bucket: string; count: number; monthlyBilling: MoneyByCurrency }[] };
}
```
Excluded: resource names, agreement notes, agreement numbers (D5), per-resource rates.

---

## 11. Security threat assessment

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | Admin/management session reaches reporting or is confused with machine auth | Three-layer deny (§2); cookie stripped; `canAccess` deny; tests for every role | Low |
| T2 | Token on a non-reporting path | Session path ignores `Authorization` | Low |
| T3 | Token leakage (OpenAI Action config, logs, repo, chat) | `rpt_` prefix for scanners; hash-only storage; 90-day expiry; scoped; id-only logging; revoke via env + firewall kill switch | **Medium**: bearer is replayable; accepted for aggregate data |
| T4 | Brute force / token guessing | 256-bit tokens; firewall limit; constant-time compare over all entries | Negligible |
| T5 | Over-exposure of fields | Field-by-field mappers; key-set snapshot and forbidden-key tests; no `select()` of whole rows; CTC columns never selected | Low |
| T6 | Parameter abuse / injection | Zod `.strict()`; Drizzle bound parameters; numeric ranges; no raw SQL from input | Low |
| T7 | DoS and cost abuse | Firewall rule, in-process throttle, memoisation, bounded queries, no DB work for bad tokens (§4) | Medium until B2 verified |
| T8 | Business data modified via GET | Four read-only layers (§3) | Low |
| T9 | Audit log tampering or sensitive data in it | Append-only (no app UPDATE/DELETE), allowlisted params only, token id not token, no bodies/IP | Low |
| T10 | Information leak through errors or enumeration | Uniform 401, generic 500, unknown-path 401 before 404 | Low |
| T11 | Stale or misleading figures | `generatedAt`, `asOf`, `notes`, 60 s TTL, definition fields | Low |
| T12 | Browser exposure | No CORS headers, `no-store`, server-to-server only | Low |
| T13 | Misconfiguration (bad env JSON, expired token) | Load-time validation, fail closed, loud log | Low (availability, not safety) |
| T14 | Commercial data leaving the company (client names, amounts) | Aggregates, scopes, D3/D8 decisions; PO policy on third-party processing | **PO decision** |
| T15 | Insider with Vercel env access | Only hashes in env; tokens unrecoverable | Low |
| T16 | Path confusion (trailing slash, `..`, case, double slash) | Gate normalises via `nextUrl.pathname`, path→scope exact table, tests | Low |

---

## 12. Testing changes

**New unit tests (`lib/reporting/*.test.ts`)**: token verification (valid, wrong, expired, duplicate ids, malformed env, constant-time path); scope table; Zod schemas (unknown key, bad currency/date, limit > 500, `to < from`, window caps); `aging.bucketFor` boundaries 0/1/30/31/60/61/90/91 and null due date; mappers' exact key sets and a recursive forbidden-key scan (`ctc, salary, email, mobile, phone, resume, token, hash, password, notes, commission, overhead, margin, deal, budget`); currency separation with mixed INR/AED/USD; capacity maths (0/60/100/shadow-only/over-100 clamp); fulfilment invariants (§7); chain-head cases (§8); memo TTL, key isolation, size bound; throttle.

**Gate and policy tests**: for each role in `ROLES`, `canAccess` and `canWrite` are `false` on `/api/reporting/v1/billing`; admin cookie alone → 401; admin cookie + valid bearer → same body as bearer alone; HEAD/POST/PUT/DELETE/OPTIONS → 405; path variants (`/api/reporting`, `/api/reporting/`, `/api/reporting/v1/billing/`, `//`, encoded dots) never reach a session branch; matcher still matches the reporting paths; bearer on `/api/invoices` → 401.

**Existing-control regression**: snapshot of `canAccess`/`canWrite` for every (role × NAV and API path) **excluding** the reporting prefix must equal the pre-change matrix; `PUBLIC_PREFIXES`/`PUBLIC_EXACT` equal their current values; full `npm test` (434) stays green.

**Structural tests**: `tests/chokepoints.test.ts` gains one explicit rule for `app/api/reporting/**`: every route must contain `reportingHandle(`, export only `GET`, and must not contain `handle(`, `getSession`, `getSessionState`. This is a distinct rule for a distinct boundary, not an exemption. Static scan for mutating verbs (§3).

**Integration tests** (`tests/reporting-integration.test.ts`, scratch libSQL file, mock data, env set before importing `db`; never the shared test Turso DB): 401 variants identical; 403 scope matrix (5×4); 422; 405; 503 when DB is made unavailable; audit insert failure does not fail the request; row-count/checksum snapshot proves no business writes; `active` past-due agreement stays `active`; reconciliation of each endpoint with `getBillingByClient`, `getInvoiceSummary`, `getResourceUtilisation` (totals), `getPipelineSummary`, `getExpiringAgreements`; aging buckets sum to outstanding; fixtures: 60/40 split, shadow, exited resource, three-version agreement chain, invoice without due date, multi-currency client, over-filled requirement.

**Manual/platform checks (PO)**: firewall rule active and blocking; kill-switch rule rehearsed; read-only Turso token cannot write; log retention noted.

---

## 13. Changed-file list

| File | Change | Note |
|---|---|---|
| `middleware.ts` | First branch: `/api/reporting` → `reportingGate`; no change to `PUBLIC_*` | Highest-review file |
| `lib/access.ts` | Deny `/api/reporting` for every role in `canAccess` and `canWrite` | Belt-and-braces |
| `lib/queries.ts` | `export` `FILLED_STATUSES` only | No behaviour change |
| `lib/ddl.ts`, `lib/schema.ts` | One table `reporting_audit_log` + index (omit if `REPORTING_AUDIT=log`) | Additive; migrate before deploy |
| `lib/reporting/verify.ts` | Pure bearer verification (Web Crypto) | Shared by gate and handler |
| `lib/reporting/gate.ts` | Edge-safe middleware gate, path→scope table | |
| `lib/reporting/handler.ts` | `reportingHandle`: re-verify, params, throttle, memo, errors, headers | |
| `lib/reporting/audit.ts` | The only mutating file; one INSERT or log line | |
| `lib/reporting/memo.ts`, `throttle.ts` | Per-instance cache and token bucket | |
| `lib/reporting/readonly-db.ts` | Second libSQL client with read-only token (falls back to normal client locally) | Verify Turso support (B3) |
| `lib/reporting/params.ts`, `types.ts`, `aging.ts` | Shared schemas, interfaces, pure bucketing | |
| `lib/reporting/{billing,invoices,capacity,pipeline,renewals}.ts` | Query plus allowlist mapper | |
| `app/api/reporting/v1/{billing,invoices,capacity,pipeline,renewals}/route.ts` | `GET` only, `dynamic = 'force-dynamic'` | |
| `tests/chokepoints.test.ts` | Reporting rule (above) | Needs PO nod: CLAUDE.md warns against exemptions |
| New tests | `lib/reporting/*.test.ts`, `tests/reporting-gate.test.ts`, `tests/reporting-integration.test.ts` | |
| `.env.example` | Names only: `REPORTING_TOKENS`, `REPORTING_AUDIT`, `TURSO_READONLY_AUTH_TOKEN` | No values |
| Docs | `docs/reporting-api/openapi.yaml`, `docs/reporting-api/runbook.md` (issue, rotate, revoke, kill switch), new FSD plus revision rows, `docs/plans/`, README access note, CLAUDE.md invariant "reporting uses `reportingGate`/`reportingHandle`, never `handle`" | |
| **Removed from Rev 1** | `reporting_tokens` table, `reporting_access_log` counters, `scripts/reporting-token.ts`, `package.json` script | |

Migration order unchanged: `db:migrate` on the target before the code that needs it. Production tokens, env variables, firewall rules and the migration are the PO's actions only.

---

## 14. Development sequence

1. PO approves this revision, confirms D12 and W1, and starts the D6 and platform verifications (B1–B4).
2. Pure core: `verify.ts`, `aging.ts`, `params.ts`, `types.ts`, `memo.ts`, `throttle.ts` with unit tests.
3. Boundary: `gate.ts`, middleware branch, `lib/access.ts` deny, handler with a stub route, chokepoint rule, role-matrix and regression tests. **Stop and review** before any dataset.
4. Audit: table (scratch DB), `audit.ts`, fail-open test, read-only static test.
5. Endpoints in value order: `/invoices`, `/billing` (behind D6 note), `/capacity`, `/renewals`, `/pipeline`; each with allowlist, reconciliation and fixture tests.
6. OpenAPI and runbook; local end-to-end on a scratch file DB with mock data; `npm test` and `npm run build` (not while dev runs).
7. PO review; PO runs migration, sets env, creates firewall rules, issues the first token, verifies one request per endpoint, rehearses revoke and kill switch.

## 15. Remaining blockers

| ID | Blocker | Owner | Blocks |
|---|---|---|---|
| B1 | **D6**: confirm how splits are entered and run the diagnostic | PO / Accounts | Final `/billing` figures |
| B2 | Vercel plan: firewall rate-limit availability, keying options, kill-switch rule, runtime log retention | PO | Rate-limit design sign-off; production exposure |
| B3 | Turso read-only token support and how it is created | PO | Read-only layer 1 (else layers 2–4 only) |
| B4 | Approve W1 (single audit INSERT) or choose `REPORTING_AUDIT=log`; confirm D12 | PO | Audit design |
| B5 | Approve edits to `lib/access.ts`, `lib/queries.ts` (export only) and the chokepoint test rule | PO | Boundary work |
| B6 | Third-party processing policy for commercial data (D1, D3, T14) | PO | Go-live |

## Verification (end to end)

`npm test` (434 existing plus new) green → scratch file DB `TURSO_DATABASE_URL="" TURSO_AUTH_TOKEN=""`, migrate and seed → token generated with `openssl`, hash set in local `REPORTING_TOKENS` → `curl` each endpoint with and without token, wrong scope, bad params, POST, admin cookie → reconcile each figure against the dashboard → confirm only one audit row per call and no business-table change → remove the token entry and confirm 401 → `npm run build`.
