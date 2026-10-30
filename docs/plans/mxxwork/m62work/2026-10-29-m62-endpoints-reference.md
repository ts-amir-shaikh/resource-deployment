---
title: M62 endpoints reference — internal routes and the proposed integration API
type: reference
date: 2026-10-29
branch: feat/m62-accounts-workspace
status: draft — integration API v1 is implemented in code (29 Oct 2026), untested against a database
---

# M62 endpoints reference

Two parts. **Part A** lists the routes that exist in this app today and what
M62 changed. **Part B** is the integration API for the manager's app (the data
side of the Tally bridge). Part B is implemented in code and covered by rule
tests, but has not been run against a database or called over HTTP yet.

Differences from the first draft: lists page with `limit` and `cursor` (last id
seen) because invoices, clients and agreements have no `updated_at` column, so
`updatedSince` is **not supported** in v1; webhooks are **not built**; a receipt
that would push received plus TDS past the invoice total is refused with 422;
`GET /invoices` also returns `total`, `received` and `tdsDeducted`.

Keys are issued with `npm run db:integration-key -- "<name>" read|read-write`.

Context: Tally → tally-bridge.exe → local SQLite → HTTPS, outbound only → the
manager's API and Postgres. Our project connects to that through a data API
and/or webhooks. Tally itself is not our concern.

---

## Part A — internal routes (exist today, session cookie required)

These are for our own screens. They are not callable by another application.
Access is decided in `lib/access.ts` (Accounts column is the M62 change).

| Method | Path | Purpose | Accounts |
|---|---|---|---|
| GET | `/api/invoices` | List; filters `status`, `project_id`, `agreement_id`, `overdue`, `period_from`, `period_to` | read |
| POST | `/api/invoices` | Create an invoice with lines. A blank `dueDate` now takes the client's `defaultDueDays` (M62) | write |
| GET | `/api/invoices/{id}` | One invoice with lines | read |
| PUT | `/api/invoices/{id}` | Edit an invoice | write |
| DELETE | `/api/invoices/{id}` | Delete; refused for a Collected invoice | write |
| POST | `/api/invoices/{id}/advance` | Move forward one step or to `targetStatus`; never backwards | write |
| POST | `/api/invoices/bulk-advance` | Advance several | write |
| GET | `/api/invoices/export` | CSV export | no (back office only) |
| GET | `/api/agreements` | List | read |
| POST | `/api/agreements` | Create | write |
| GET | `/api/agreements/{id}` | One agreement | read |
| PUT | `/api/agreements/{id}` | Number, title, notes only | write |
| DELETE | `/api/agreements/{id}` | Delete | write |
| PUT | `/api/agreements/{id}/correct` | Correct terms; needs acknowledgement when invoices exist | write |
| POST | `/api/agreements/{id}/renew` | Append-only renewal row linked by `parent_agreement_id` | write |
| GET | `/api/agreements/{id}/history` | Renewal chain | read |
| GET | `/api/clients` | List. Billing fields are removed for TA, Leadgen and Sales (M62) | read |
| POST | `/api/clients` | Create a client | no |
| GET | `/api/clients/{id}` | One client with projects | read |
| PUT | `/api/clients/{id}` | Rewrite the client record | no |
| DELETE | `/api/clients/{id}` | Delete | no |
| **PUT** | **`/api/clients/{id}/billing`** | **New (M62).** `gstin`, `billingAddress`, `paymentTerms`, `defaultDueDays` only | write |
| GET | `/api/resources`, `/api/deployments`, `/api/projects` | Read for margin and CTC | read |

PO consumption has no route of its own: it is computed on the agreement detail
page from `lib/po-rules.ts` (invoiced before GST, raised invoices only, same
currency only, warning at 15% or less remaining).

### Planned internal routes (slices B and C, not built)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/invoices/{id}/receipts` | Record a payment: date, amount, TDS, note |
| POST | `/api/invoices/{id}/receipts/{rid}/reverse` | Reverse a mistaken receipt with a counter-entry |
| GET | `/api/invoices/{id}/receipts` | Receipt history |
| POST | `/api/invoices/{id}/credit-notes` | Full or partial credit with a required reason |
| GET | `/api/invoices/{id}/credit-notes` | Credit notes on an invoice |
| POST | `/api/invoices/{id}/convert` | Proforma to tax invoice |
| POST | `/api/invoices/drafts` | Draft a month's invoices, idempotent per month |

---

## Part B — integration API (for the manager's app)

Implemented under `app/api/integration/v1`. For review by the manager and the other team.

### Conventions

- Base path `/api/integration/v1`, HTTPS, JSON.
- Auth: `Authorization: Bearer <key>`. One key per caller, stored hashed,
  rotatable, scoped `read` or `read-write`.
- Pushes carry the caller's own record ID as `externalId`. Re-sending the same
  `externalId` updates, never duplicates.
- Money is `{ "amount": number, "currency": "INR" | "AED" | "USD" }`. No
  conversion between currencies.
- Dates are `YYYY-MM-DD`.
- Errors: `{ "error": string, "fields"?: { field: message } }` with 400, 401,
  403, 404, 409 or 422.
- Pull lists accept `limit` (1 to 500, default 100) and `cursor` (the `nextCursor` of the previous page). `updatedSince` is not supported yet.
- Margin, CTC, salary and resource rates are never in any response.
- Nothing in the API can delete or deactivate a record.

### Pull — they read from us

| Method | Path | Returns |
|---|---|---|
| GET | `/clients` | `id`, `companyName`, `gstin`, `billingAddress`, `paymentTerms`, `defaultDueDays` |
| GET | `/agreements?status=` | `id`, `agreementNumber`, `title`, `clientId`, `currency`, `value`, `startDate`, `endDate`, `status`, `consumption { invoiced, remaining }` |
| GET | `/invoices?status=&agreementId=` | `id`, `invoiceNumber`, `clientId`, `agreementId`, `periodFrom`, `periodTo`, `amount`, `gstAmount`, `currency`, `fxRateToInr`, `invoiceDate`, `dueDate`, `status`, `externalReference` |
| GET | `/invoices/{id}` | The invoice plus lines: `resource name`, `billedDays`, `amount` |

Example:

```json
GET /api/integration/v1/invoices?status=raised&limit=100
{
  "items": [
    {
      "id": 412,
      "invoiceNumber": "TS/26-27/0412",
      "clientId": 18,
      "agreementId": 77,
      "periodFrom": "2026-09-01",
      "periodTo": "2026-09-30",
      "amount": { "amount": 480000, "currency": "INR" },
      "gstAmount": 86400,
      "fxRateToInr": 1,
      "invoiceDate": "2026-10-03",
      "dueDate": "2026-11-02",
      "status": "raised",
      "externalReference": null
    }
  ],
  "nextCursor": null
}
```

### Push — they write to us

| Method | Path | Purpose |
|---|---|---|
| POST | `/invoices/{id}/external-reference` | Store their voucher or invoice reference against our invoice |
| POST | `/receipts` | A payment received. Needs slice B |

```json
POST /api/integration/v1/invoices/412/external-reference
{ "externalId": "V-2026-00931", "reference": "Sales Voucher 931" }
```

```json
POST /api/integration/v1/receipts
{
  "externalId": "RCT-2026-00457",
  "invoiceNumber": "TS/26-27/0412",
  "receivedDate": "2026-10-28",
  "amount": { "amount": 433600, "currency": "INR" },
  "tdsDeducted": { "amount": 48000, "currency": "INR" },
  "note": "NEFT, UTR 123456"
}
```

Receipt rules we apply on our side:
- the invoice must exist and be in the same currency;
- received plus TDS is added to what is already recorded;
- the invoice becomes Collected only when received plus TDS covers its total,
  recomputed on our server, never taken from the request;
- an unknown invoice number returns 404 and nothing is stored.

### Webhooks (optional, later)

We call a URL they give us: `invoice.raised`, `invoice.status_changed`,
`agreement.created`. Signed with an HMAC header, retried on failure. Start with
polling through `updatedSince`; add webhooks only if they ask.

### Not in this version

Ledgers, expenses, sales vouchers and outstanding sent to us. Those belong to
the later Integration API module after the manager's answers.

### Open questions for the manager

1. Do they send us receipts, or does Accounts enter them here and we only send
   invoices out?
2. Polling with `updatedSince`, or webhooks?
3. Who issues the invoice number: us (recommended) or them?
4. Is there a test instance of their app we can call with mock data?
