# Handover and onboarding

For a developer joining this project. Read `CLAUDE.md` first, then this.

Written 2026-10-21 against commit `8045c27`.

---

## 1. First hour

**You work against a local database and mock data. You are not given production
or Vercel credentials, and you do not need them** (Product Owner's decision,
21 Oct 2026). Everything below runs with two values you generate yourself.

```bash
git clone <repo> && cd resource-deployment
npm install
cp .env.example .env.local        # set AUTH_SECRET and APP_PASSWORD, nothing else
npm run db:migrate                # creates the schema in ./data/deployment.db
npm run db:seed                   # demo dataset (destructive — clears tables)
npm test                          # expect 196 passing, ~2s
npm run dev
```

Generate the signing secret with `openssl rand -base64 32`.

Leave `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` **unset**. With both empty the
app uses the local file at `./data/deployment.db`. As long as no `.env` file
exists in your clone, `npm run dev` cannot reach production — there is nothing
for it to read.

Opens at http://localhost:3000. `scripts/seed.ts` creates **no accounts**, so
the shared `APP_PASSWORD` signs you in as Admin. Google sign-in and SMTP stay
unconfigured and unneeded.

**One trap.** Creating your first real account closes the `APP_PASSWORD` door
permanently, and with no SMTP configured the People screen's *Send link* cannot
deliver a password. Create accounts with **`npm run db:user`** instead, which
prompts for the password directly and never takes it as a flag:

```bash
npm run db:user -- --list
npm run db:user -- --create --name "QA Accounts" --username qa-acc --role accounts
npm run db:user -- --reset --username qa-acc      # recovers a lost password
```

`--reset` is the way out of a lockout — it needs no email. Note that
`npm run db:clean` will *not* help: it deliberately excludes the `users` table,
so accounts survive a wipe. To start completely fresh, delete
`data/deployment.db` and re-run `db:migrate` and `db:seed`.

You will need one account per role to exercise the role-specific screens, since
four roles (`accounts`, `resource_manager`, `interviewer`, `resource`) currently
land on `/welcome`.

Deploys are not yours. The Product Owner pushes to production and runs every
migration against Turso.

---

## 2. The environment hazards, in order of damage

### `.env` holds production credentials — on the owner's machine

`.env` is untracked and exists only on the Product Owner's machine, where it
holds the live Turso URL and auth token. `npm run dev` and every `npm run db:*`
script read it, so on *that* machine a plain `npm run dev` is a live editing
session against real client, salary and invoice data.

**In your clone this file does not exist, which is the point of the local-only
setup.** Keep it that way: use `.env.local`, and never create a `.env`. If
someone sends you production values, you have been handed the hazard rather than
the fix — the Product Owner's decision was that you do not need them.

### `npm run db:clean --commit` against Turso is irreversible

It empties every table. There is **no undo** and no soft delete. Against Turso
it demands typing `DELETE ALL DATA` verbatim first — that prompt is the only
thing between you and a production wipe. Against the local file it runs
immediately.

### There is no backup of the production database

Nothing is scheduled. Assume a destructive mistake is unrecoverable until this
is fixed.

Worse, this gap has **fallen through a hole in the planning**. It is tracked as
**G-PLT-09**, but worded as *"scheduled backups on the AWS server before
production moves there"* — and production never moved there. AWS is out of
scope, production runs on Vercel against **Turso**, and no gap covers backing
up Turso. Re-scope G-PLT-09 to the architecture actually in use.

### `main` auto-deploys to Vercel with no test gate

`.github/workflows/build.yml` only builds AWS images on `release-*` tags.
Nothing runs `npm test` on push. Run `npm test` and `npm run build` locally
before every push until a CI gate exists — and note that a green suite says
much less than it looks like it does, for the reason in `CLAUDE.md` §5.

### `.claude/launch.json` has two dead configurations

`deployment-scratch` and `deployment-mock` point at session scratchpad paths
that no longer exist. The `deployment` config runs plain `npm run dev`, so it
inherits the production-`.env` hazard above. Repoint or delete them.

---

## 3. Outstanding security items

These need action, not just awareness.

| Item | Status |
|---|---|
| **GitHub PAT embedded in the git remote URL** | The token sits in `.git/config` as `https://<token>@github.com/…`. A *clone* is safe; **copying the project folder leaks it.** Rotate it and switch the remote to SSH. |
| **Turso auth token exposed** | It was printed into an assistant transcript during a failed redaction. Rotate it. |
| **Shared Claude account** | The owner has chosen to share one account rather than issue a seat. Activity is attributed to the account, not the person, and the rate limit is shared. Mitigation: **require pull requests**, so `git log` and PR authorship record who changed what. Rotate the token when a developer rolls off. |
| **No Turso backup** | See §2. The tracking gap is written against the abandoned AWS architecture, so nothing covers the live database. |
| **No rate limiting on public write endpoints** | `/api/jobs/*` (apply) and `/api/share/*` (referral submission) are unauthenticated by design and uncapped. |
| **No error monitoring** | Nothing reports a production exception. Failures are invisible until a user complains. |

`/share/[token]` and `/jobs/*` are **deliberately unauthenticated** — that is
the feature. The share page exposes the requirement and JD only: never budget,
client contacts, candidate names or internal stage. Keep it that way, and
remember anyone holding the link can read it.

---

## 4. Known issues in the code

### Agent runs persist resume text

`lib/agents/run.ts` stores `JSON.stringify(opts.inputs)` on the `agent_runs`
row, and `inputs` includes `resumeText`. So **DOCX, TXT and pasted resume
content is retained in the database**, even though resume *files* are never
stored. PDFs escape this because they are passed as document blocks rather than
extracted to text.

This contradicts what the team was told ("resumes are never stored"). Either
redact `resumeText` before persisting, or correct the statement. Unresolved.

### `maxDuration = 300` needs Vercel Pro

The agent routes request a 300-second ceiling. On the Hobby tier the limit is
lower, so long agent runs will be cut off. Confirm the plan before relying on
it.

### M31 — interviewer module is part-built

The role, expiring `access_until`, the `interviewer_duty` flag, the
`interview_panel` table and the `/welcome` holding page all exist and are
tested. **Missing are the interviewer's own screens**: published slots
(G-INT-02), scheduled rounds (G-INT-03), submission review (G-INT-04), feedback
form (G-INT-05).

The same shape applies to `accounts`, `resource_manager` and `resource` — role
and access done, screens absent.

### `tally-test.ts` at the repo root is untracked scratch

A throwaway connectivity probe, not a foundation. See
`docs/PLATFORM-VISION.md` for what a real Tally bridge still needs.

### `.claude/worktrees/` holds a stale checkout

Roughly 426 MB, including its own `node_modules`. Safe to remove with
`git worktree remove`. It also skews any naive `find`-based file count across
the repo — measure inside `app/ lib/ components/ scripts/ tests/` instead.

### The README's Deploying section is stale

It describes EC2 production with a `develop` branch and `release-*` tags. The
current model is **Vercel from `main`**, with AWS out of scope since
2026-10-21. `CLAUDE.md` §2 is authoritative.

---

## 5. Where the context actually lives

The project history is **not** in a chat thread. Claude Code conversations are
local `.jsonl` files under `~/.claude/projects/` on the owner's machine, and
they do not travel with an account token. Likewise the owner's Claude *memory*
files were machine-local — their content has been transferred into this repo,
which is why these documents exist.

Read in this order:

1. **`CLAUDE.md`** — hard rules, architecture invariants, conventions. Loaded
   automatically by any Claude Code session in this repo, on any machine.
2. **`README.md`** — setup, auth, business rules, CSV import, data cutover.
   Deploying section stale.
3. **`docs/PLATFORM-VISION.md`** — the nine departments, the journey, decisions
   D1–D8, Tally facts.
4. **`docs/WAYS-OF-WORKING.md`** — plan-then-build, the FSD update rule, the
   living artifact URLs.
5. **`docs/fsd/`** — 14 functional specs plus **FSD-00A**, the feature-gap
   register (55 Must, 41 Good-to-have). Cut work from the Must items first.
6. **`docs/plans/`** — two approved implementation plans, as the model for new
   ones.

Two documents that are **not** in the repo and must be requested from the
product owner: the business-logic references
`docs/HR Business Executive instructions.md` and
`docs/evaluation process rule book.md` are present, but the plan artifact, FSD
library and AWS runbook live as claude.ai artifacts — URLs in
`docs/WAYS-OF-WORKING.md`.

---

## 6. Suggested first tasks

Ordered so that the first three reduce risk before any feature work:

1. **Add a CI test gate** — `npm test` + `next build` on every pull request,
   and stop pushing straight to `main`. Highest value, lowest effort.
2. **Write tests for the money paths** — invoice pro-rating, leave handling,
   currency grouping, the Zod schemas. This is the largest unguarded surface in
   the application.
3. **Rotate the two credentials** in §3 and switch the git remote to SSH.
4. **Build the Accounts workspace** (G-ACC-01). The cheapest real module: the
   role, account management and expiring access already exist, so it is screens
   on top of finished foundations.

Remember rule one: **a module-wise plan is presented and approved before any of
this gets built.**
