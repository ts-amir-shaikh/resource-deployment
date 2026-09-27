# Job Board & Referrals

`FSD-04 · JOB`

The public face of the pipeline. Chosen requirements are advertised on an open job board that people can apply through, and consultants given a share link can suggest profiles. Everything that comes in lands in a review queue, never directly in the candidate pool.

| Field | Value |
|---|---|
| Module code | JOB |
| Module version | v3.0 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Public: /jobs, share link |
| Screens | /jobs · /jobs/[id]-[slug] · /share/[token] |
| Owner | Product Owner |

## 1. Purpose and scope

The requirement stays the single record. Publishing it gives it a public advert without anything being typed twice, and taking it down, whether by hand or on closing, stops it being served. Two public intake paths exist: an **application**, where people apply for themselves from the job board, and a **referral**, where a consultant holding a share link suggests someone.

### In scope

- Publishing and withdrawing a requirement, and its public title.
- How the client is described in public.
- The job board, the job page, and the page shown for a closed role.
- The apply form and the share-link suggestion form.
- Search-engine rules for the public pages.

### Covered elsewhere

- Reviewing what comes in (call log, duplicate warnings, approve and dismiss): FSD-03.
- The share link itself and stakeholder comments: FSD-02.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales | Public |
|---|---|---|---|---|---|---|
| Publish or withdraw a listing | Yes | — | Yes | — | Yes | — |
| Set the public client label, and whether to name the client | Yes | — | Read | — | — | — |
| View board and apply | Anyone, no sign-in |  |  |  |  |  |
| Suggest a profile on a share link | Anyone holding the link |  |  |  |  |  |

The Phase 5 decision was Admin and TA for publishing. Sales gained it with the Phase 12 access rules, which allow Sales every change under a requirement.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **Publishing** | | | |
| FR-JOB-001 | A requirement is private until someone deliberately publishes it. **Publish to job board** on the requirement page lists it, with an optional public title of up to 120 characters. | v1.1 | `Live` |
| FR-JOB-002 | The listing dialog shows, read-only, how the client will be described, so the person publishing sees exactly what goes out. | v2.0 | `Live` |
| FR-JOB-003 | The date a requirement is first listed is kept, and drives newest-first order and "Posted 3 days ago". Updating the title of a listed role does not reset it. | v1.1 | `Live` |
| FR-JOB-004 | A Won or Lost requirement cannot be published. Moving a requirement to Won or Lost withdraws it automatically, and the stage dialog says so. | v1.1 | `Live` |
| FR-JOB-005 | Listed requirements carry a globe marker in the pipeline list. On the requirement page, a **Listed** button opens the public page. | v1.1 | `Live` |
| **Public board and job page** | | | |
| FR-JOB-006 | `/jobs` lists every listed role, newest first, with title, company descriptor, skills, experience, work mode, location, engagement type, number of openings and posted date. | v1.1 | `Live` |
| FR-JOB-007 | The board can be searched by role, skill or location, and filtered by work mode. The filter offers only the modes that appear on the board. | v1.1 | `Live` |
| FR-JOB-008 | Each role has its own page with the full JD and working days and hours. The address combines the id and a readable slug from the title. Only the id is used to find the role, so renaming never breaks a link. | v1.1 | `Live` |
| FR-JOB-009 | A link to a role that has been withdrawn or closed opens a page saying the requirement is closed, instead of a bare "not found". | v1.1 | `Live` |
| FR-JOB-010 | Public pages never show client budget, hiring budget, deal value, internal stage, priority, owners, next step, candidates or the client's contacts. | v1.1 | `Live` |
| **Applying** | | | |
| FR-JOB-011 | The apply form asks for name, email and mobile (at least one of the two), years of experience, notice period, current and expected CTC, and anything else the applicant wants to add. | v1.1 | `Live` |
| FR-JOB-012 | An optional section asks whether someone at Techstalwarts referred them, with that person's name and email as free text. | v2.0 | `Live` |
| FR-JOB-013 | A submitted application goes into the applicant queue as *Applied*. The applicant sees only a plain acknowledgement, which reveals nothing about whether they applied before. | v2.1 | `Live` |
| FR-JOB-014 | Applying to a closed role is refused with "This role is no longer open and is not accepting applications." | v1.1 | `Live` |
| **Share-link suggestions** | | | |
| FR-JOB-015 | The share page has a **suggest a profile** form. It asks for the consultant's name with an email or mobile, the candidate's name with an email or mobile, experience, notice, current and expected CTC, and notes. | v1.0 | `Live` |
| FR-JOB-016 | Suggestions land in the applicant queue as *Referred*, and appear under Suggested Profiles on the requirement page with a count of new ones. | v1.0 | `Live` |
| FR-JOB-017 | A share link for a Won or Lost requirement refuses new suggestions. | v1.0 | `Live` |
| **Search engines** | | | |
| FR-JOB-018 | Only `/jobs` and job pages may be indexed. Share links, sign-in and the API are excluded. | v1.1 | `Live` |

## 4. Business rules

### BR-JOB-01 · How the client is named in public

By default the board does not name the client. It shows the public company label set by Admin on the requirement, or "A Techstalwarts client" if none is set. The real client name appears only when Admin has ticked *show client name* on that requirement.

```text
company shown = client name           if show client name is on
                public label          otherwise, if set
                "A Techstalwarts client"  otherwise
```

### BR-JOB-02 · Public title

The public title replaces the internal title on the board and in the page address. If none is set, the internal title is used.

### BR-JOB-03 · Staging, never direct

Both public forms write only to the applicant queue. Nothing submitted publicly becomes a candidate until a signed-in user approves it (FSD-03, BR-CAN-05). A contact route is mandatory: an email or mobile for the candidate, and for a referral, for the consultant too.

### BR-JOB-04 · Withdrawing does not un-publish

Withdrawing a listing stops it being served. It cannot remove copies already cached by search engines or saved by people who opened it.

## 5. Data

| Record | Table | Holds |
|---|---|---|
| Listing state | opportunities | Listed flag, date first listed, public title, public company label, show-client-name flag. |
| Inbound profile | referrals | Kind (application or referral), candidate details, referrer details, notes, and review fields (see FSD-03). |
| Referring employee | referrals.referred_by_resource_id | Meant to link an application to the employee who referred it. The column exists, but nothing sets it yet (FS-JOB-01). |

## 6. Interfaces

- **Staffing Pipeline (FSD-02)**: the source of every listing. Stage moves to Won or Lost withdraw it.
- **Candidates (FSD-03)**: the applicant queue receives everything submitted here.
- **Platform (FSD-01)**: marks these routes public and sets the search-engine rules.

## 7. Version history

- **v1.0** (major) · 7 Sep 2026 · cf2805b · M13  
  Profile suggestions through the share link, into a staging inbox.
- **v1.1** · 7 Sep 2026 · aedf57b · M16  
  Public job board, job pages, apply form, publish and withdraw, automatic withdrawal on close, closed-role page, and search-engine rules.
- **v2.0** (major) · 8 Sep 2026 · 854d4a7 · M23 M24  
  Referrer question on the apply form. The public client label moved to the Admin-only requirement form, so TA can no longer decide how a client is described.
- **v2.1** · 10 Sep 2026 · 7166e56 · M26  
  Applications and referrals reviewed together in one applicant queue.
- **v3.0** (major) · 17 Sep 2026 · 3baa593 · M41 — **current**  
  Access rules for the new roles: Sales can publish and withdraw, Lead Generation cannot. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-JOB-01 | Confirm the referring employee — M23 planned a review step that suggests matching employees for the typed referrer name, so someone internal can confirm the link. The column exists but the step was never built, so referrals by staff cannot yet be credited or reported on. | Plan M23 | Medium | `Planned` |
| FS-JOB-02 | Protect the public forms from abuse — The apply and suggestion forms have no rate limit or bot check. A simple per-address limit and a hidden trap field would stop scripted spam without adding a CAPTCHA. | This review | Medium | `Proposed` |
| FS-JOB-03 | Resume link on the apply form — Same item as FS-CAN-04. | Plan P10 | Medium | `Proposed` |
| FS-JOB-04 | Job-posting data for search engines — Structured job-posting markup and a sitemap would let listed roles appear in job search results. | This review | Low | `Proposed` |
| FS-JOB-05 | Withdraw a listing when a requirement goes on hold — Only Won and Lost withdraw automatically today. | This review | Low | `Proposed` |
| FS-JOB-06 | Acknowledgement email to applicants — Depends on choosing an email provider (FS-PLT-09). | This review | Later | `Deferred` |

## 9. Known limitations

- **Referrers are free text.** The public form deliberately has no staff picker, which would hand the employee list to anyone. Until FS-JOB-01 is built, the typed name is all that is kept.
- **Direct applicants are counted as Referral.** An approved application becomes a Referral-sourced candidate (see FSD-03).
- **Share pages name the client. The job board does not.** This is intended: a share link goes to one chosen consultant, and the board is read by anyone.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v3.0 | First issue, written against commit `5e43f82`. |
