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

## 6. Current Repository State

- No real Spectora sample export exists in this repository yet — this is a
  final-submission blocker. See `sample-data/spectora/README.md` and
  `docs/spectora-format.md`.
- A Supabase project is already provisioned; connection details live in the
  (gitignored) `.env` at the repo root. **`SUPABASE_SERVICE_ROLE_KEY` is still
  empty** — required for the import API route to actually write anything.
- The DB schema exists as two migrations
  (`supabase/migrations/20260915000000_import_pipeline.sql`,
  `20260915010000_import_integrity.sql`) but has **not been applied** to the
  live project — this session's sandbox has no outbound IPv6 route and this
  project's direct-connection host is IPv6-only, so `supabase db push`/`psql`
  couldn't reach it from here. Apply both, in order, via the Supabase SQL
  Editor (or `supabase db push` from a machine with normal network access)
  before the import API can persist anything. See `docs/decision-log.md` D7
  and `docs/requirements-matrix.md` row 13.
- Application foundation exists: Next.js App Router + TypeScript strict +
  Tailwind + shadcn/ui, with the design system, reusable components, and
  placeholder routes described in `docs/work-plan.md` Phase 1.
- The deterministic Spectora importer is fully implemented in
  `src/lib/import/` — a pure, Supabase-free, LLM-free pipeline (file
  validation → workbook loading → structural row extraction → normalization
  → hierarchy building → rich-content sanitization → schema validation)
  producing the canonical `CanonicalTemplate` model plus
  `ImportIssueCandidate[]`, with deterministic (injectable) ID generation and
  checksum-based text comparison. It is validated only against
  `tests/fixtures/synthetic-spectora-like.xlsx` and one inline
  structurally-different fixture (clearly-labeled synthetic data — see
  `docs/spectora-format.md`), not against a real export.
- The importer is wired to Supabase persistence:
  `POST /api/import` (`src/app/api/import/route.ts`, Node runtime) →
  `runSpectoraImport` (`src/lib/persistence/import-service.ts`) → the
  `import_template(jsonb)` Postgres function, called once so the whole
  template tree commits or rolls back atomically — see D7. Every attempt
  (including early failures) is recorded in `import_runs`.
- A successful write feeds the deterministic **Import Integrity Engine**
  (`src/lib/integrity/`, THIS IS NOT AI — see D9) — the primary product
  differentiator. It re-reads the template from Postgres post-commit and
  reconciles it against the in-memory parse result: structure counts,
  ordering, whitespace-normalized text preservation, link preservation, and
  source-row coverage (every meaningful row classified mapped/unsupported/
  ignored-with-reason; `unaccountedRows > 0` forces `review_required`
  regardless of everything else). Reports one of four statuses — `verified`
  / `verified_with_warnings` / `review_required` / `failed` — never a score,
  persisted to `import_runs.integrity_status`/`integrity_result`.
- 80 unit tests pass without a database; 2 live-DB integration tests are
  skip-gated behind `SUPABASE_SERVICE_ROLE_KEY` + an explicit opt-in env
  var, and haven't run yet (blocked on the two items above).
- The UI now calls the real pipeline end to end: `/` (Templates dashboard,
  `export const dynamic = "force-dynamic"` — always reads live Supabase, no
  build-time snapshot) lists real templates with counts and integrity
  status via `listTemplateSummaries`; `/import` is a real drag-and-drop
  upload workflow (`src/app/import/import-workspace.tsx`) with real
  upload-byte progress (XHR) and an honest, non-fabricated indeterminate
  state for server-side processing (no fake percentage — the backend is one
  synchronous call with no intermediate signal); on success it redirects to
  `/templates/[templateId]/import-report`, which now renders the real
  `IntegrityResult` (`getTemplateReport`) instead of a placeholder. All of
  this was verified against the actual (currently credential-less) backend:
  every page shows the real, honest "Supabase server credentials are not
  configured" error rather than fake data or a crash.
- Template duplication is implemented (requirement 6): one call to the
  `duplicate_template(uuid, text)` Postgres function deep-copies
  sections/items/comments with all-new ids, atomically. `import_runs` and
  `import_issues` are deliberately not copied — a duplicate isn't a fresh
  import, so it carries lineage (`templates.parent_template_id`) and a
  "Copy" badge instead of a fabricated integrity status (D10). After the
  write, both templates are re-read and `verifyDuplicateIndependence`
  confirms matching content and disjoint row-id sets (D11) — disjoint ids
  are what make independent editing safe, since every write is keyed by id.
  Manual SQL equivalents of all six independence proofs are in
  `docs/db-verification.md`.
- `/templates/[templateId]` is now a real, working editor (two-pane: tree
  nav left, debounced-autosave editing right — section/item names via
  `editable-name-field.tsx`, comment rich text via a Tiptap setup in
  `comment-editor.tsx` scoped to exactly the server sanitizer's allowlist).
  Save state is explicit and aggregated in the top bar
  (`editor-session.tsx`); Cmd/Ctrl+S flushes all pending saves. Server
  Actions in `template-edit-actions.ts` are Zod-validated
  (`template-edit-validation.ts`, 15 tests) before touching the DB. This
  was verified end-to-end with a temporary Playwright session against mock
  data (not committed — installed, used, uninstalled), which caught two
  real bugs before being called done: the top-bar save-status aggregate
  could silently desync from field status, and a Server Action that threw
  instead of returning `{ success: false }` left the UI stuck on "Saving…"
  forever. Both fixed; the same throw-vs-reject gap was also found and
  fixed in last phase's `issue-actions.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
