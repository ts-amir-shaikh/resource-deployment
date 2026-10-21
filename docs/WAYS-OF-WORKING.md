# Ways of working

The process the product owner expects. This is not optional ceremony — plans
get read and approved before each build phase, and the FSD update is part of
Definition of Done.

## 1. Plan before development

**Present a module-wise plan and wait for approval before writing code.**

Stated at project kickoff — *"Prepare module wise plan first prior to
development"* — and reinforced by the review rhythm since. This holds for new
requirements arriving mid-project, not just at kickoff: when new scope appears,
plan the new modules first rather than going straight to code.

How to apply:

1. Update the living plan artifact with the new modules.
2. Present a concise summary in the conversation.
3. **Stop and wait for the nod.**

Deliver plans as an artifact and keep republishing to the *same URL*, so there
is one living plan document rather than a pile of snapshots.

Approved plans are also written to `docs/plans/` as markdown — see the two
existing files there for the expected shape.

## 2. FSDs live in the repo, and are updated as development proceeds

The module FSDs are markdown files in **`docs/fsd/`**, in the same form as the
plan documents under `docs/plans/`. They are updated **as development
proceeds**, not only in the claude.ai artifact.

The reason: docs in the repo stay versioned with the code that implements them.

How to apply:

- **Every implementation plan ends with a unit that updates the affected FSD
  files**: module version bump, a revision row, and moving shipped FS items to
  FR items.
- **Definition of Done requires the FSD update.** A feature is not done when it
  works; it is done when the spec says what it does.
- Versioning: **major** = a changed outcome or changed access, **minor** = an
  added capability.
- The artifact is republished *from* the repo copies afterwards, so the two
  never drift.

## 3. Compound engineering mode

When the product owner says **"act in compound engineering mode"**, run the loop
from Every's compound-engineering plugin:

```
brainstorm → plan → work → simplify → review → compound
```

The **compound** step is the one people skip and the one that matters: record
what was learned — decisions, pitfalls, rules — in durable places (this repo's
docs, the FSD library, the plan artifact) so the next task starts further ahead.

**Plugin status.** `compound-engineering@compound-engineering-plugin` is
installed at **local scope**, which means it is enabled for this repo only via
`.claude/settings.local.json` — a file that is **not committed**. Its commands
are `/ce-brainstorm`, `/ce-plan`, `/ce-work`, `/ce-simplify-code`,
`/ce-code-review`, `/ce-compound`.

Consequences worth knowing:

- A **new developer's clone will not have the plugin.** They must install it
  themselves, or follow the loop by hand.
- **Cloud sessions load neither** local-scope nor repo-enabled plugins.

To install it for this repo only:

```bash
claude plugin marketplace add EveryInc/compound-engineering-plugin
claude plugin install compound-engineering@compound-engineering-plugin --scope local
```

Local scope writes `.claude/settings.local.json` (this repo only). Project scope
writes the committed `.claude/settings.json`. **Never install without the
owner's go-ahead** — it is persistent configuration.

Prefer `/ce-plan` for module plans (the plan still gets approved before
building), `/ce-code-review` for reviews, `/ce-compound` after shipping.

## 4. Living documents

| Document | URL |
|---|---|
| **Module-wise plan** (the living plan) | https://claude.ai/code/artifact/0d1a51a8-3f69-4a6d-86ed-d9d8518548da |
| **Module FSD library** (14 specs + gap register) | https://claude.ai/artifact/X1aigvJXqU4CopKdMQvQNr |
| **AWS Deployment Runbook** | https://claude.ai/code/artifact/620bfb85-5029-40c2-a45c-aabede2e9b48 |

Republish to the **same URL** when modules are added or scope changes. When
publishing from a different conversation, pass the URL explicitly as `url` so it
updates in place instead of creating a second copy.

The FSD library was issued Rev 1.0 on 2026-09-27 against commit `5e43f82`. When
a module ships: bump that module's version, add a revision row, move shipped
FS-items to FR-items, republish. Keep it in step with the plan artifact.

**The AWS runbook is currently dormant.** Infrastructure decisions fixed on
2026-09-15 — prod on EC2 at `staffing.techstalwarts.com`, test on Vercel at
`staffing-test.techstalwarts.com`, `develop` → Vercel testing, `main` →
production via `release-*` tags, `t4g.small`, product owner runs the data
migration — were **superseded on 2026-10-21**: AWS hosting is not required for
now and **only Vercel deployment is in use, from `main`**. Do not follow the
runbook or the README's Deploying section without checking that decision first.

## 5. Verification habits that have caught real bugs

- **Check production data before designing.** Only 2 of 9 opportunities had
  budgets — which is why opportunity value returns null rather than zero and why
  the KPI cards carry a coverage caveat.
- **Grep the served bundle for code unique to the commit** to confirm a deploy
  swapped in. A `200` and a changed chunk hash both prove nothing.
- **Run the migration before pushing the code that needs it.**
- **Verify arithmetic by hand** before trusting a KPI the UI renders.
- **Validate the label against the code.** Two items marked "not built" in the
  plan (M59, M31) were already built; one carried a factually wrong reason.
  Read the source, not the status column.
