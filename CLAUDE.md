# CLAUDE.md — Engineering Constitution for Hive Inspect (FDE Assessment)

This file governs how any engineer — human or AI agent — works in this repository.
It takes precedence over general habits, defaults, or "helpful" shortcuts. If a
requested change conflicts with this file, flag the conflict instead of silently
resolving it in the direction of least resistance.

## 1. Project Purpose

An inspection company is migrating their inspection template from Spectora to new
software. That template represents years of accumulated work. **They will not
manually recreate it.**

We are building the migration tool for a Forward Deployed Engineer hiring
assessment. The product imports a Spectora "Export to spreadsheet → Export HTML
Text" file and turns it into an editable, persisted, structured template — without
ever losing or silently altering the customer's original content.

The differentiator we are building toward is **Import Integrity**: a deterministic
system that proves what was imported, what was preserved, what changed, what is
unsupported, and what needs human review. Everything else (editing UI, duplication,
AI auditor) is built on top of that trust layer, not instead of it.

## 2. Architecture Principles

- **Deterministic core, optional AI shell.** The parser, normalizer, hierarchy
  builder, and integrity engine are plain deterministic TypeScript. They must
  produce the same output for the same input, with no model calls in the critical
  path of import/edit/duplicate/persist.
- **Structured data model, not an HTML blob.** Templates are stored as
  sections → items → fields/comments, each with stable IDs, not as a single
  rendered document. Editing operates on this structure.
- **One canonical pipeline.** Spectora XLSX → file validation → spreadsheet
  parser → normalization → hierarchy builder → safe rich-content processing →
  canonical template model → schema validation → deterministic integrity engine →
  atomic persistence in Supabase → template editor / import report → optional AI
  auditor. Do not introduce parallel or shortcut paths that bypass a stage.
- **Nothing disappears quietly.** Any source row/cell that cannot be mapped into
  the canonical model must be recorded as "unsupported" or "needs review," never
  dropped without a trace.
- **Real backend, real persistence.** Supabase Postgres is the system of record.
  No mock database standing in for the real thing in the deployed app.
- **Simple over clever.** Prefer the boring, explainable solution. This codebase
  must be walkable in a live interview.
- **Importer generality.** The importer must work against the structure of a
  Spectora HTML-text export in general, not against the specific sample file's
  quirks. Avoid hard-coded section names, row offsets, or sample-specific
  conditionals.

## 3. Assessment Rules (condensed — see `docs/requirements-matrix.md` for full detail)

1. Import a Spectora "Export to spreadsheet → Export HTML Text" spreadsheet.
2. Preserve text, hierarchy, and ordering.
3. Never silently drop unsupported/skipped content.
4. Allow editing of section names, item names, comment text.
5. Persist edits in a real backend.
6. Duplicate a template so the copy is fully independent.
7. Use a structured editable data model, not one opaque HTML blob.
8. Explain handling of formatting, links, and rich content.
9. Clearly distinguish "not present in source" vs. "present but unsupported by
   our importer."
10. Importer must not be hard-coded to only one sample export.
11. Demonstrate preservation verification.
12. Demonstrate at least one failure case.
13. Use a real backend/database.
14. Public deployment must work on Vercel.
15. Live app must already contain an imported template reviewers can explore.
16. Repo must include the Spectora sample export actually used.
17. README must contain setup, DB setup, and environment instructions.
18. NOTES.md must explain: what was cut, supported input, known limitations, how
    work was checked, approximate time spent, credits/libraries/starters.
19. AI inside the product is optional, and only built after the baseline works.
20. AI must never silently modify source content or become the source of truth
    for import correctness.

## 4. Things AI / Code Agents Must Never Do

- **Never fabricate a Spectora sample export.** If no real export exists in the
  repo, say so plainly. Do not pretend a placeholder or synthetic file is the
  assessment's real export — synthetic fixtures must be labeled synthetic.
- **Never let AI be the source of truth for import correctness.** Counts, diffs,
  preservation checks, and pass/fail integrity results come only from the
  deterministic engine. AI may explain those results; it may not compute or
  override them.
- **Never let AI parse the source spreadsheet as the primary import mechanism.**
  The deterministic parser owns import. AI does not stand in for it, even
  experimentally.
- **Never let AI write directly to imported template data.** No AI-initiated
  mutation of sections/items/comments/persisted rows.
- **Never let an AI feature failure break core functionality.** Import, edit,
  duplicate, and persistence must keep working even if the AI auditor errors out,
  times out, or is disabled entirely.
- **Never silently drop content during import.** Anything not mapped into the
  canonical model is logged as unsupported/skipped with a reason, not discarded.
- **Never collapse the "not in source" vs. "in source but unsupported" distinction.**
  These are different facts about the world and must remain visibly different in
  the UI and data model.
- **Never add authentication** unless a genuine requirement emerges. The reviewer
  must be able to open the deployed app with zero friction.
- **Never build out-of-scope features**: inspection scheduling, payments, report
  writing, homeowner portals. Not in scope for this assessment.
- **Never hard-code parsing logic to the specific sample file's contents.** If a
  rule is only ever validated against one file, treat it as a code smell.
- **Never commit secrets.** `.env` stays out of git (see `.gitignore`). Service
  role keys and DB passwords are never written into docs, code comments, or
  commit messages.
- **Never silently expand scope.** Don't add speculative abstractions, extra
  services, or "nice to have" infrastructure beyond what a phase in
  `docs/work-plan.md` calls for.

## 5. Definition of Done

A phase or feature is "done" only when:

- It passes the deterministic integrity checks it introduces or touches, with a
  test demonstrating the behavior (Vitest, and Playwright where practical).
- No source content is lost or misclassified without an explicit, visible
  "unsupported" record.
- The requirement it satisfies is marked accordingly in
  `docs/requirements-matrix.md`, with a pointer to the evidence (test, screen, or
  script).
- It works end-to-end against the real Supabase backend, not a mock.
- It works in the deployed Vercel app, not just locally, before being called
  complete for deployment-related requirements.
- It's explainable in one or two sentences to a non-implementer — if it can't be,
  it's probably over-engineered for this assessment.

## 6. Current Repository State (as of initial setup)

- No Spectora sample export exists in this repository yet. See
  `sample-data/spectora/README.md`.
- A Supabase project is already provisioned; connection details live in the
  (gitignored) `.env` at the repo root. The service role key is not yet filled in.
- No application code exists yet. This first pass only establishes governance
  docs (this file, `docs/requirements-matrix.md`, `docs/architecture.md`,
  `docs/decision-log.md`, `docs/work-plan.md`).
