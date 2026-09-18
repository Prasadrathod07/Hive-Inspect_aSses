# Work Plan

Phases follow the pipeline in `docs/architecture.md` §1. Each phase should reach
a demonstrable, testable state before the next one starts — this is a sequence,
not a set of parallel workstreams, so that correctness at each stage is never
resting on an unverified assumption from the stage before it.

## Phase 0 — Governance & Setup (this pass)
- ENGINEERING.md, requirements matrix, architecture doc, decision log, work plan.
- Confirm real Spectora sample export location, or flag it missing.
- Git repository initialized; `.gitignore` protecting `.env`.
- **Exit criteria**: docs exist and are internally consistent; blockers on the
  sample export are explicit, not hidden.

## Phase 1 — Project Scaffold
- Next.js App Router + TypeScript + Tailwind + shadcn/ui project bootstrap.
- Supabase client setup (browser + server), env var wiring against the
  already-provisioned project in `.env`.
- Vitest configured and running (even with a placeholder test) so later phases
  never start test infra from zero.
- **Exit criteria**: `npm run dev` serves an empty app locally; `npm run test`
  runs green with at least one trivial test.

## Phase 2 — Database Schema
- Design and migrate the Postgres schema from `docs/architecture.md` §3
  (`templates`, `sections`, `items`, `comments`, `import_reports`,
  `skipped_rows`), via Supabase migrations.
- Zod schemas mirroring the DB shape for the canonical template model.
- **Exit criteria**: schema applied to the Supabase project; a hand-written
  seed row round-trips through Zod validation.

## Phase 3 — File Validation & Spreadsheet Parser
- XLSX upload handling (route handler/server action) with file-type/size
  validation.
- SheetJS-based raw row/cell extraction.
- Structural (not literal-text) detection of section/item/comment rows,
  designed against the real sample export's structure but not hard-coded to its
  specific wording (requirement 10).
- **Exit criteria**: parser produces raw tagged rows for the real sample file;
  unit tests cover the row-role detection logic.

## Phase 4 — Normalization & Hierarchy Builder
- Whitespace/entity normalization; per-row classification into
  mappable-or-unsupported with reason codes.
- Hierarchy assembly into section → item → comment tree with stable order
  indices mirroring source order.
- **Exit criteria**: canonical (pre-rich-content) model produced for the real
  sample file; ordering test asserts output order matches source row order.

## Phase 5 — Rich Content Sanitization
- Allowlist-based HTML sanitizer per the policy in `docs/architecture.md` §5.
- Link validation (`href` scheme + `rel` enforcement on render).
- Unsupported-formatting flagging wired into the same reason-code system as
  Phase 4.
- **Exit criteria**: sanitizer unit tests cover allowlisted tags, links, and at
  least one disallowed/malformed case that gets flagged rather than silently
  stripped-with-no-trace.

## Phase 6 — Canonical Model, Schema Validation & Atomic Persistence
- Assemble the full canonical model (structure + sanitized rich content).
- Zod validation gate before persistence.
- Single-transaction write of template + sections + items + comments +
  skipped_rows to Supabase.
- **Exit criteria**: importing the real sample file end-to-end produces a fully
  persisted template in Supabase, or fails atomically with a clear error —
  verified by inspecting the DB directly.

## Phase 7 — Deterministic Integrity Engine
- Row-count reconciliation (source in vs. mapped+skipped out), per section and
  total.
- Preserved / changed / unsupported classification per field.
- `absent_in_source` vs. `unsupported_by_importer` distinction implemented as
  real, queryable data (requirement 9).
- Import report persisted alongside the template (`import_reports`).
- **Exit criteria**: report generated for the real sample import; a test
  asserts the reconciliation invariant (`source rows == mapped + skipped`) holds.

## Phase 8 — Failure Case
- Construct a deliberately malformed fixture (e.g. broken HTML cell, missing
  section header, unexpected sheet structure).
- Verify the two failure paths from `docs/architecture.md` §6: per-row skip
  (import continues) and file-level reject (import aborts atomically, no
  partial data).
- **Exit criteria**: test suite includes this fixture and asserts the correct
  path is taken with a clear, user-facing error/skip explanation (requirement 12).

## Phase 9 — Template Editor UI
- Import screen (upload → progress → report).
- Section/item/comment editing (name + comment text fields), persisted via
  server actions.
- Import report screen surfacing preservation verification results and the
  absent-vs-unsupported distinction visually.
- Visual direction per `ENGINEERING.md`/assessment design principles: clean,
  restrained, B2B SaaS — not a hackathon UI.
- **Exit criteria**: manual (and where practical, Playwright) walkthrough of
  import → review report → edit a section/item/comment → reload → edits
  persisted.

## Phase 10 — Duplicate Template
- Deep-copy action: new template row + new section/item/comment rows with new
  IDs, no shared foreign keys with the source.
- **Exit criteria**: test edits the duplicate and asserts the original template
  is byte-for-byte unchanged in the DB.

## Phase 11 — Deployment & Seed
- Deploy to Vercel; wire Supabase env vars in Vercel project settings.
- Run a real import against production Supabase so the live app already
  contains an explorable, imported template (requirement 15).
- **Exit criteria**: live Vercel URL reachable with zero login friction, showing
  a real imported template and its import report.

## Phase 12 — Documentation Pass
- Root `README.md`: setup, DB setup, environment instructions, clean-machine
  checklist.
- Root `NOTES.md`: cuts, supported input, limitations, verification approach,
  time spent, credits/libraries/starters.
- Update `docs/requirements-matrix.md` statuses to reflect final state.
- **Exit criteria**: a reviewer with no prior context could clone, set up, and
  run this locally from README alone.

## Phase 13 — AI Import Auditor (bonus, only after Phase 0–12 are DONE)
- Read-only endpoint/component consuming already-persisted integrity engine
  output (Phase 7).
- Plain-language explanation of the report surfaced in the import report UI.
- Explicit failure isolation: AI errors/timeouts degrade gracefully (e.g. "AI
  explanation unavailable" banner) without touching import/edit/duplicate.
- **Exit criteria**: disabling/breaking the AI call has zero effect on any
  non-AI requirement's test suite; demonstrated with a test that simulates AI
  failure and asserts the rest of the app is unaffected.

## Dependencies & Sequencing Notes

- Phases 3–8 are strictly sequential — each consumes the previous stage's
  output shape.
- Phase 9 (editor UI) can start once Phase 6 (persistence) is stable, in
  parallel with Phase 7–8 if needed, since the editor mainly needs the
  canonical model to exist in the DB, not the integrity engine specifically.
  The import *report screen* within Phase 9 does depend on Phase 7.
- Phase 16 sample export is a hard prerequisite for validating Phases 3–8
  against real data; see `sample-data/spectora/README.md`. Synthetic fixtures
  can unblock structural work (e.g. proving the parser isn't hard-coded, per
  requirement 10) but cannot substitute for the real export where the
  requirements explicitly call for it (requirements 15, 16).
- Phase 13 must not start before Phase 12 is DONE, per `docs/decision-log.md`
  D5.
