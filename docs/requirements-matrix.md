# Requirements Matrix

Tracks every assessment requirement against its planned implementation and the
evidence that will prove it's satisfied. Status starts at `TODO` for all rows and
should be updated in place as work lands — this file is the single source of
truth for "are we done yet," not a summary written after the fact.

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| # | Requirement | Planned Implementation | Evidence / Test | Status |
|---|---|---|---|---|
| 1 | Import a Spectora "Export to spreadsheet → Export HTML Text" spreadsheet | XLSX upload → file validation → SheetJS parse → deterministic normalizer → atomic Supabase persistence → deterministic integrity verification, via a real drag-and-drop UI (`/import`) calling `POST /api/import` | `src/lib/import/parse-workbook.ts`, `src/lib/persistence/import-service.ts`, `src/lib/integrity/`, `src/app/api/import/route.ts`, `src/app/import/import-workspace.tsx`; 80 passing Vitest unit tests + 2 skip-gated live-DB integration tests (see row 13). Only validated against synthetic fixtures — real-file validation blocked, see row 16 | IN PROGRESS |
| 2 | Preserve text, hierarchy, and ordering | Hierarchy builder assigns stable order indices per section/item as encountered; canonical model preserves source order, not re-sorted; persisted as `order_index` per row | `src/lib/import/hierarchy.ts` (`position` field) + DB schema (`order_index` column, `supabase/migrations/20260915000000_import_pipeline.sql`) | IN PROGRESS |
| 3 | Never silently drop unsupported/skipped content | Every meaningful source row is classified `mapped` / `unsupported` / `intentionally ignored with reason` by the deterministic Import Integrity Engine, with `unaccountedRows` required to be 0 for a trusted import; the Issue Review page (`/imports/[importRunId]/issues`) shows the full retained raw snippet for every one, with explicit "retained in full, never discarded" copy | `src/lib/integrity/compute-integrity.ts` `computeSourceCoverage` + `compute-integrity.test.ts`; `src/app/imports/[importRunId]/issues/page.tsx` renders `issue.rawSnippet` for every issue via `SourceComparison`; live round-trip blocked, see row 13 | IN PROGRESS |
| 4 | Allow editing of section names, item names, comment text | `/templates/[templateId]` — a two-pane desktop editor: left-hand hierarchy tree (`template-tree.tsx`), main pane with debounced-autosave name fields (`editable-name-field.tsx`) and a scoped Tiptap rich-text editor for comments (`comment-editor.tsx`, bold/italic/underline/lists/link — matched exactly to the sanitizer allowlist) | Verified with a real headless-browser session against a mock template: typing → "Unsaved changes" → "Saving…" → (given no live DB yet) "Save failed" with the edit preserved, not cleared. Server actions in `src/lib/persistence/template-edit-actions.ts`; validated via `template-edit-validation.test.ts` (15 cases). Live round-trip blocked, see row 13 | IN PROGRESS |
| 5 | Persist edits in a real backend | Supabase Postgres tables for templates/sections/items/comments; edits write through Server Actions (`updateSectionName`/`updateItemName`/`updateCommentContent`), each server-side Zod-validated before touching the DB | `src/lib/persistence/template-edit-actions.ts` + `template-edit-validation.ts`; no schema change needed — edits use the same columns import already writes to. Live write blocked, see row 13 | IN PROGRESS |
| 6 | Duplicate a template and make the copy fully independent | `duplicate_template(uuid, text)` Postgres function deep-copies templates/sections/items/comments in one transaction, every row with a new id; lineage recorded as `templates.parent_template_id`. `import_runs`/`import_issues` are deliberately not copied — a duplicate isn't a fresh import (`docs/decision-log.md` D10). Dialog proposes "[Name] — Copy", name editable, states "The copy will be independent of the original"; on success it navigates to the copy | `supabase/migrations/20260916000000_template_duplication.sql`; `duplicate-template.ts` re-reads both templates post-commit and runs `verifyDuplicateIndependence` (D11). 14 unit tests in `verify-duplicate-independence.test.ts` cover proofs 1–5 (same content, all-new ids, and — via an id-keyed update simulation — that editing one tree can't reach the other); 9 more in `duplicate-template-validation.test.ts`. 5 skip-gated live-DB proofs in `duplicate-template.integration.test.ts`, with the manual SQL equivalent in `docs/db-verification.md`. Dialog behaviour browser-verified (proposed name, independence copy, failure keeps the typed name). Live run blocked, see row 13 | IN PROGRESS |
| 7 | Structured editable data model, not one opaque HTML blob | Canonical TS/Zod model (`CanonicalTemplate` → `CanonicalSection[]` → `CanonicalItem[]` → `CanonicalComment[]`); Postgres schema (`templates`/`sections`/`items`/`comments`, typed columns, FKs) mirrors it; the editor now proves it's genuinely editable at each level, not just readable | `src/lib/import/types.ts`; `supabase/migrations/20260915000000_import_pipeline.sql`; `/templates/[templateId]` edits section/item names and comment rich text independently, each its own row/field, never a single blob. Migration is written and reviewed but **not yet applied** to the live project — blocked, see row 13 | IN PROGRESS |
| 8 | Explain handling of formatting, links, and rich content | Documented rich-content policy (`docs/architecture.md` §5, detailed further in `docs/spectora-format.md`) implemented as a `sanitize-html` allowlist; explanation surfaced in NOTES.md and in-app import report | `src/lib/import/rich-content.ts` + `rich-content.test.ts` (incl. `<img>`/`<table>`/`<iframe>` unsupported-content cases, safe/unsafe/changed link cases); NOTES.md section still TODO | IN PROGRESS |
| 9 | Distinguish "not present in source" vs. "present but unsupported by our importer" | An item with a blank comment cell gets zero comments and no issue (absent); a comment the sanitizer had to alter raises `unsupported_formatting`/`unsupported_link` (unsupported by importer); the integrity engine keeps these as distinct source-coverage buckets. The Issue Review UI states the distinction explicitly in copy ("present in source but unsupported by this importer," never "not present in source" without an exact-row-match proof) and the hierarchy lookup (`buildHierarchyMap`) only ever claims a section/item match on an exact source-row match — no inference from neighboring rows | `hierarchy.test.ts` "absent in source, not an issue" case; `compute-integrity.test.ts` "unsupported row correctly accounted for" suite; `get-import-run-issues.ts` `buildHierarchyMap` (exact-match only, doc-commented); issue cards on `/imports/[importRunId]/issues` | IN PROGRESS |
| 10 | Importer must not be hard-coded to one sample export | Parser driven by structural detection (resilient header normalization + keyword scan, column-role mapping), not fixed row/column indices or literal template text | `extract-rows.ts` (`normalizeHeaderCell` + keyword synonyms, no hard-coded positions/filename); `parse-workbook.test.ts` "no fixed template shape" test uses different header wording and a different section count | IN PROGRESS |
| 11 | Demonstrate preservation verification | The deterministic Import Integrity Engine (`src/lib/integrity/`, THIS IS NOT AI): structure counts, ordering, whitespace-normalized text preservation, and link preservation, each compared source-parsed vs. Postgres-persisted, collecting every mismatch rather than stopping at the first. Reports one of four honest statuses (`verified` / `verified_with_warnings` / `review_required` / `failed`) — never a score (`docs/decision-log.md` D9) — persisted to `import_runs.integrity_status`/`integrity_result`, and rendered in full on `/templates/[templateId]/import-report` (every metric this requirement lists, plus the literal "N unaccounted source rows" phrase) | `src/lib/integrity/compute-integrity.ts` + `compute-integrity.test.ts` (20 cases) + `format-report.test.ts`; `src/app/templates/[templateId]/import-report/page.tsx` renders structure/coverage/ordering/text/links/formatting, all sourced directly from the persisted `IntegrityResult`, nothing computed client-side. Live round-trip blocked on row 13 | IN PROGRESS |
| 12 | Demonstrate at least one failure case | Unreadable/invalid/oversized/wrong-extension files and unrecognized structures return `ok: false` with no partial template; at the persistence layer, every attempt (including these) is recorded as a `failed` `import_runs` row with the real error, never silently; a persistence round-trip that doesn't match what was parsed is its own distinct `failed` integrity status | `parse-workbook.test.ts` failure suites; `import-service.ts` `recordFailedRun`; `compute-integrity.test.ts` count/order-mismatch cases; live-DB assertion in the skip-gated integration test | IN PROGRESS |
| 13 | Use a real backend/database | Supabase Postgres: schema + atomic `import_template()` and `duplicate_template()` RPCs + integrity-result columns + issue resolution-status workflow, written as four migrations; service-role client (`src/lib/supabase/server-client.ts`) used server-only | Migration files (`supabase/migrations/20260915000000_import_pipeline.sql`, `20260915010000_import_integrity.sql`, `20260915020000_import_issue_resolution.sql`, `20260916000000_template_duplication.sql`) + `import-service.integration.test.ts` and `duplicate-template.integration.test.ts` (both skip-gated); `docs/db-verification.md` gives the copy-pasteable manual equivalent. **BLOCKED** on two things only the project owner can do: (1) apply all four migrations, in order — this session's sandbox has no outbound IPv6 route and Supabase's direct-connection host is IPv6-only for this project, so `supabase db push`/`psql` couldn't reach it; apply via the Supabase SQL Editor or from a machine with normal network access instead; (2) fill in `SUPABASE_SERVICE_ROLE_KEY` in `.env`, currently empty | BLOCKED — awaiting migration application + service role key |
| 14 | Public deployment must work on Vercel | Next.js App Router app deployed to Vercel, env vars configured in Vercel project settings | Live Vercel URL, verified working end-to-end | TODO |
| 15 | Live app must already contain an imported template reviewers can explore | The full exploration path now exists: Templates dashboard (`/`) → template → Import integrity report (`/templates/[id]/import-report`, real `IntegrityResult` rendering) → Issue Review (`/imports/[runId]/issues`, grouped, with resolution controls) — all reading live Supabase (`force-dynamic`, no build-time snapshot); a seed/import step against production Supabase before final submission, using the real sample export, is still needed | Every page in the path renders real data with an honest `ErrorState` when there's none yet (verified: currently shows the real "Supabase server credentials are not configured" error, not fake cards) — see row 13. Live URL landing on a pre-imported template is still blocked on rows 13 and 16 | TODO |
| 16 | Repo must include the Spectora sample export actually used | Real export committed under `sample-data/spectora/` | File present in repo at that path (currently: not yet provided — see `sample-data/spectora/README.md`) | BLOCKED — awaiting real export file |
| 17 | README must contain setup, DB setup, and environment instructions | Root `README.md` with prerequisites, install, Supabase setup, env vars, run/test commands | README reviewed against a clean-machine checklist | TODO |
| 18 | NOTES.md must explain cuts, supported input, limitations, verification approach, time spent, credits | Root `NOTES.md`, written last, after implementation is substantially complete | NOTES.md present and complete before submission | TODO |
| 19 | AI inside the product is optional, implemented only after baseline is complete | AI Auditor deferred to its own final phase in `docs/work-plan.md`, behind the deterministic baseline | Work plan phase ordering; AI code doesn't exist until baseline phases are DONE | TODO |
| 20 | AI must never silently modify source content or become the source of truth for import correctness | AI Auditor is read-only over integrity engine output; no write path from AI to template tables | Code review checklist item + architecture doc constraint (§7) | TODO |

## Notes on this table

- Row 16 is currently **BLOCKED**: no Spectora export exists anywhere in this
  repository. This must be resolved before requirements 1, 2, 11, 15, and 16 can
  be verified against real data. See `sample-data/spectora/README.md` and
  `docs/spectora-format.md`.
- Rows 1, 2, 3, 9, 10, 11, and 12 are **IN PROGRESS** with a complete
  deterministic parser (`src/lib/import/`, 49 passing Vitest tests across 5
  files) built and validated against `tests/fixtures/synthetic-spectora-like.xlsx`
  plus an inline structurally-different fixture (different headers, different
  section count) — both clearly-labeled synthetic, not the real export row 16
  is still waiting on. None of these should move to DONE until (a) a real
  export lets `docs/spectora-format.md` replace its assumptions with observed
  fact, and (b) the parser is wired into the UI/persistence (still TODO:
  Phases 6, 9 of `docs/work-plan.md`).
- Row 8 moved to **IN PROGRESS**: the sanitizer allowlist is implemented and
  tested; the NOTES.md explanation and in-app surfacing are still TODO.
- Row 13 is now **BLOCKED** (was TODO): the schema, atomic persistence
  function, service-role client, and Node import service are all written and
  unit-tested, but two things remain that only the project owner can do —
  applying the migrations (this session couldn't reach Postgres directly; see
  `docs/decision-log.md` D7) and populating `SUPABASE_SERVICE_ROLE_KEY`.
  Rows 1, 2, 3, 7, 9, 11, and 12 all have a live-database component that
  stays IN PROGRESS rather than DONE until row 13 clears, per
  `CLAUDE.md` §5's "works end-to-end against the real Supabase backend, not
  a mock."
- Rows 3, 9, 11, and 12 now point at the deterministic Import Integrity
  Engine (`src/lib/integrity/`) rather than the parser's own in-memory
  reconciliation — the engine supersedes and subsumes that earlier check by
  re-reading the *actually persisted* template and reconciling it against
  the parser's issues and source-row records. It reports one of four honest
  statuses, never a percentage/score (`docs/decision-log.md` D9), and treats
  `unaccountedRows > 0` as an automatic `review_required`, regardless of how
  clean every other metric looks.
- The Templates dashboard (`/`) and import workflow (`/import`) are now real,
  production-quality UI reading/writing live Supabase data — not static mock
  cards. Each `TemplateCard`'s "Duplicate" button is intentionally rendered
  disabled (`title="Duplicating templates is not implemented yet"`): row 6 is
  still TODO, and CLAUDE.md prohibits half-finished implementations, so the
  affordance is honest about not working yet rather than silently omitted or
  faked. The import workflow shows real upload-byte progress (XHR
  `upload.onprogress`) but never a fabricated processing percentage — the
  server's validate/parse/persist/verify pipeline is one synchronous call
  with no intermediate signal, so that phase shows an indeterminate,
  non-sequenced "what's happening" checklist instead of fake numbers.
- The import report and Issue Review pages are now fully wired to the real
  `IntegrityResult`: `/templates/[templateId]/import-report` renders every
  metric requirement 11 lists (structure, source coverage with the literal
  "N unaccounted source rows" phrase, ordering, text preservation, links,
  formatting) and groups issues into six presentation categories
  (`src/lib/integrity/issue-presentation.ts`: sanitized unsafe HTML,
  formatting changed, unsupported source content, unmapped/unknown rows,
  link differences, validation issues) that link to a filtered
  `/imports/[importRunId]/issues`. That page adds a reviewer workflow
  (`import_issues.resolution_status`, migration
  `20260915020000_import_issue_resolution.sql`): open ↔ accepted is a real,
  working toggle (`src/lib/persistence/issue-actions.ts`, a Server Action);
  `resolved` is schema-ready but deliberately not manually settable yet,
  since it's meant to mean "fixed through an actual edit" and editing
  (row 4) doesn't exist yet — showing it as clickable now would be exactly
  the half-finished-feature pattern CLAUDE.md prohibits.
- Rows 4 and 5 moved to **IN PROGRESS**: the template editor
  (`/templates/[templateId]`) is a real, working two-pane desktop workflow —
  hierarchy tree on the left, debounced-autosave editing on the right,
  a small scoped Tiptap setup for comments (bold/italic/underline/lists/link,
  deliberately matched 1:1 to the server sanitizer's allowlist so the
  toolbar never offers formatting the server would silently strip on save).
  Save state is explicit (`SaveStatus`: Unsaved changes / Saving… / Saved ✓ /
  Save failed) and aggregated in the top bar; Cmd/Ctrl+S flushes every
  pending field immediately. A failed save never clears the local edit.
  Verified with a real headless-browser session (Playwright, temporary —
  not committed) against mock data, which caught and led to fixing two real
  bugs before this could be called done: (1) the top-bar aggregate status
  could silently desync from field-level status after certain re-renders
  (fixed by merging two effects that needed to stay atomic — see the
  comment in `use-autosave-field.ts`); (2) a Server Action that threw
  instead of resolving `{ success: false }` left the UI stuck on "Saving…"
  forever instead of showing "Save failed" (fixed in both
  `template-edit-actions.ts` and, defensively, in the hook itself — and the
  same pre-existing gap was found and fixed in last phase's
  `issue-actions.ts` too).
- Row 6 moved to **IN PROGRESS**: duplication is implemented and the
  "Duplicate" buttons on the dashboard and in the editor are now real rather
  than the honest-but-disabled placeholders they were. The independence
  guarantee rests on one checkable fact — the original's and the copy's row-id
  sets are disjoint — because every write in this app is keyed by row id
  (`.eq("id", …)`), so an update aimed at one template provably cannot reach a
  row of the other. That's asserted in unit tests, re-checked at runtime after
  every copy, and reproducible by hand via `docs/db-verification.md`.
- A knock-on fix landed with row 6: dashboard counts now come from the actual
  section/item/comment rows rather than the import run's stored counts. A
  duplicate has no import run, so it would otherwise have rendered as
  "0 sections, 0 items, 0 comments" — and now that editing exists, import-time
  counts were a stale snapshot anyway.
- This table should be updated as part of the same change that satisfies a row,
  not in a separate "update docs" pass.
