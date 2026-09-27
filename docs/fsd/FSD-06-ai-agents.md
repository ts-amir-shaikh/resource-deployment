# AI Agents

`FSD-06 · AGT`

Assistants the recruiting team runs inside the application: validating a resume against a JD, reformatting a resume to a client template, and generating interview questions for a requirement. Every run is recorded with who ran it, what it cost and what it said, under a monthly spending cap.

| Field | Value |
|---|---|
| Module code | AGT |
| Module version | v3.1 |
| Doc revision | Rev 1.0 |
| Status | `Live` |
| Baseline | 5e43f82 · 27 Sep 2026 |
| Appears as | Agents · requirement page |
| External service | Anthropic API |
| Owner | Product Owner |

## 1. Purpose and scope

The agents bring the analysis the team used to do in separate chat tools into the application, against its own requirements, with the results kept. They are the only part of the system that calls an outside service, costs money per use, and sends third parties' personal data (resumes) elsewhere. Those three facts shape the rules below.

Every agent receives the same instructions: the *HR Business Executive instructions* and the *evaluation process rule book*, both kept in the repository so any change to them is reviewed. The integrity rules in those documents apply to every agent: never invent, keep verified fact separate from inference, and never present exposure to a skill as expertise.

### Out of scope

- Making hiring decisions. Every output is evidence for a person to weigh.
- Reading Google Chat or client email. Those steps of the playbook remain manual.

## 2. Users and access

| Action | Admin | Management | TA Team | Lead Gen | Sales |
|---|---|---|---|---|---|
| Run an agent | Yes | — | Yes | — | Yes |
| Read past runs | Yes | Yes | Yes | — | Yes |
| Agent configuration check | Yes | — | — | — | — |

The Agents area is never public. It has no share-link or job-board equivalent.

## 3. Deployed functionality

| ID | Requirement | Since | Status |
|---|---|---|---|
| **The agents** | | | |
| FR-AGT-001 | **Resume Validation** scores a resume against a JD out of 100, with a requirement-match table, a score breakdown, strengths, gaps (split into confirmed, unverified and risks), points to validate, and a confidence level. A high score never hides a missing non-negotiable. | v1.0 | `Live` |
| FR-AGT-002 | **Resume Formatting** reformats a resume to a client's reference template without adding content. Anything missing is bracketed, and it returns a note for internal use listing the information that needs confirming. | v1.0 | `Live` |
| FR-AGT-003 | **Interview Questions** produces a question set for a requirement, grouped under the rating criteria the candidate will be scored against. Each question comes with what a strong answer contains, what a weak or rehearsed answer sounds like, and a follow-up probe. Questions on mandatory skills are marked. | v2.0 | `Live` |
| FR-AGT-004 | **JD Evaluator** and **Budgeting** are retired. They no longer appear in the picker, and the server refuses new runs of them. Their past runs stay readable. | v2.0 | `Retired` |
| **Running an agent** | | | |
| FR-AGT-005 | A run can take the JD from a requirement already in the pipeline, chosen from a searchable picker, instead of pasting it. The requirement's title, company, experience, skills, work mode, location, engagement, positions and working pattern are included with the JD. | v3.1 | `Live` |
| FR-AGT-006 | A resume can be uploaded (PDF, DOCX or text, up to 10MB each) or pasted as text. A PDF goes to the model as the document itself, so its layout is kept. A DOCX is converted to text first. | v1.0 | `Live` |
| FR-AGT-007 | Optional inputs: a label for the run, role and commercial details, a reference template (for formatting), and anything else the agent should know. | v1.0 | `Live` |
| FR-AGT-008 | Interview-question runs receive the active rating criteria: every global one, plus any specific to the chosen requirement. | v2.0 | `Live` |
| FR-AGT-009 | The requirement page has a **Generate interview questions** button that runs the same agent for that requirement. Past sets are listed there. If the JD has changed since the latest set was generated, the page says so. Questions are never regenerated automatically. | v2.0 | `Live` |
| **Records and cost** | | | |
| FR-AGT-010 | Every run is recorded: agent, label, who ran it, linked requirement, text inputs, the answer, model, input and output tokens, estimated cost in USD, and whether it completed or failed. | v1.0 | `Live` |
| FR-AGT-011 | The Agents page lists past runs, which can be reopened without paying for them again. | v1.0 | `Live` |
| FR-AGT-012 | When a monthly cap is set, the page shows spend so far against the cap. Once the cap is reached, runs pause until the next month or until the cap is raised. | v1.0 | `Live` |
| FR-AGT-013 | If the API key is not configured, the page says so and nobody can start a run. | v1.0 | `Live` |
| FR-AGT-014 | An Admin-only configuration check confirms that each agent's instructions still build, still contain the integrity rules, and are free of the corruption found in the original instructions file. | v1.0 | `Live` |

## 4. Business rules

### BR-AGT-01 · Model per agent

| Agent | Model | Why |
|---|---|---|
| Resume Validation | claude-opus-5 | The reasoning and scoring are what matter. |
| Interview Questions | claude-opus-5 | Question quality depends on reading the JD closely. |
| Resume Formatting | claude-sonnet-5 | Restructuring rather than judgement. |

### BR-AGT-02 · Cost estimate

Cost is estimated from the token counts at a fixed price table held in code: Sonnet at $3 input and $15 output per million tokens, Opus at $15 and $75. The table is fixed deliberately, so that past run costs never change under recorded history. It is updated on purpose when prices change.

```text
cost (USD) = input tokens ÷ 1,000,000 × input price
           + output tokens ÷ 1,000,000 × output price
```

### BR-AGT-03 · Monthly cap

The cap is a setting in the deployment environment, in USD. Zero or unset means no cap. Spend is the sum of every run's estimated cost in the current calendar month (UTC), across all users. The check happens before a run starts, so a run begun just under the cap can finish above it.

### BR-AGT-04 · What is kept from a resume

An uploaded file is never stored. It is held in memory for the call and then discarded. The **text** sent with a run is stored with the run's inputs, and that includes text extracted from a DOCX or text file, and resume text pasted in. The content of a PDF is sent as the document itself and is not stored.

### BR-AGT-05 · Retired, not deleted

A retired agent is hidden and refused, never removed, so its past runs keep their label and stay readable. Refusal happens on the server, because hiding a button does not stop a crafted request, and every run costs money.

## 5. Data

| Record | Table / location | Holds |
|---|---|---|
| Agent run | agent_runs | Fields in FR-AGT-010, and a candidate link that is not used yet. |
| Instructions | docs/*.md | The two instruction documents, version-controlled with the code. |
| Settings | environment | API key (server only, never sent to a browser) and the monthly cap. |

## 6. Interfaces

- **Staffing Pipeline (FSD-02)**: supplies JDs, and records when a JD last changed, so question sets can be flagged as out of date.
- **Candidates (FSD-03)**: rating criteria group the interview questions.
- **Anthropic API**: the model provider, called from the server only.

## 7. Version history

- **v1.0** (major) · 7 Sep 2026 · d03217c · M19 M20  
  Agents tab with JD Evaluator, Budgeting, Resume Validation and Resume Formatting. Run history, cost estimates and the monthly cap.
- **v2.0** (major) · 10 Sep 2026 · 7166e56 · M28  
  Interview Questions added, including a button on the requirement page. JD Evaluator and Budgeting retired.
- **v3.0** (major) · 17 Sep 2026 · 3baa593 · M41  
  Sales can run agents. Lead Generation has no access.
- **v3.1** · 24 Sep 2026 · 686d99f · M47 — **current**  
  Searchable requirement picker. **Current version.**

## 8. Future scope

| ID | Item | Source | Priority | Status |
|---|---|---|---|---|
| FS-AGT-01 | Decide how long resume text is kept — Resume text from DOCX, text files and pasted input is kept in run records with no end date (BR-AGT-04). Either strip it from stored inputs, or set a retention period. The candidate-consent question from Phase 7 applies here as well. | This review | High | `Proposed` |
| FS-AGT-02 | Attach a validation to a requirement — Planned in M20: a finished Resume Validation attaches to a requirement and creates a candidate carrying its score. The data has a candidate link and a folder was reserved for it, but it was never built. | Plan M20 | Medium | `Planned` |
| FS-AGT-03 | Show the estimated cost before a run — The Phase 7 plan showed each run's estimated cost before confirming. The estimate can already be calculated, but the screen does not show it. | Plan M19 | Low | `Planned` |
| FS-AGT-04 | Compare generated questions with the questions actually asked — Interview rounds record the questions asked (FSD-03). Setting them against the generated sets would show which questions predict a good hire. | Plan M31 | Later | `Deferred` |
| FS-AGT-05 | A hard cap — Reserve a run's estimated cost before it starts, so spend can never pass the cap. | This review | Low | `Proposed` |

## 9. Known limitations

- **Resume text is kept for non-PDF input.** Stated in full in BR-AGT-04, and raised as FS-AGT-01.
- **Costs are estimates.** They come from token counts and the fixed price table, not from the provider's invoice.
- **The cap can be exceeded by one run.** See BR-AGT-03.
- **Consent.** Whether client contracts and candidate consent allow CVs to be processed by an outside model is a business question, raised in Phase 7 and not settled in the application.

## Revision history

| Rev | Date | Module ver. | Change |
|---|---|---|---|
| 1.0 | 27 Sep 2026 | v3.1 | First issue, written against commit `5e43f82`. |
