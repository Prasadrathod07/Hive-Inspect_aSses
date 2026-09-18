# Requirements Matrix

Tracks every assessment requirement against its planned implementation and the
evidence that will prove it's satisfied. Status starts at `TODO` for all rows and
should be updated in place as work lands — this file is the single source of
truth for "are we done yet," not a summary written after the fact.

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| # | Requirement | Planned Implementation | Evidence / Test | Status |
|---|---|---|---|---|
| 1 | Import a Spectora "Export to spreadsheet → Export HTML Text" spreadsheet | XLSX upload → file validation → SheetJS parse → deterministic normalizer → atomic Supabase persistence → deterministic integrity verification, via a real drag-and-drop UI (`/import`) calling `POST /api/import` | `src/lib/import/parse-workbook.ts`, `src/lib/persistence/import-service.ts`, `src/lib/integrity/`, `src/app/api/import/route.ts`, `src/app/import/import-workspace.tsx`; 172 passing Vitest unit tests + 2 skip-gated live-DB integration test files (see row 13). Only validated against synthetic fixtures — real-file validation blocked, see row 16 | IN PROGRESS |
| 2 | Preserve text, hierarchy, and ordering | Hierarchy builder assigns stable order indices per section/item as encountered; canonical model preserves source order, not re-sorted; persisted as `order_index` per row | `src/lib/import/hierarchy.ts` (`position` field) + DB schema (`order_index` column, `supabase/migrations/20260915000000_import_pipeline.sql`) | IN PROGRESS |
| 3 | Never silently drop unsupported/skipped content | Every meaningful source row is classified `mapped` / `unsupported` / `intentionally ignored with reason` by the deterministic Import Integrity Engine, with `unaccountedRows` required to be 0 for a trusted import; the Issue Review page (`/imports/[importRunId]/issues`) shows the full retained raw snippet for every one, with explicit "retained in full, never discarded" copy. Extended with a three-level split (`docs/architecture.md` §5a) so that dropping this bar to "never silently drop" doesn't collapse into "warn about everything": harmless formatting noise (whitespace, empty tags, a bare wrapper) is normalized silently but still logged (`normalization_events`, never deleted or overwritten without a trace); anything that can't be silently normalized either gets a reviewable "Fix Safely" proposal or stays manual-review-only — nothing in between disappears | `src/lib/integrity/compute-integrity.ts` `computeSourceCoverage` + `compute-integrity.test.ts`; `src/app/imports/[importRunId]/issues/page.tsx` renders `issue.rawSnippet` for every issue via `SourceComparison`; `src/lib/import/rich-content.ts` + `rich-content.test.ts` (Level A/B/C split, 32 cases); `supabase/migrations/20260918000000_safe_normalization.sql`; live round-trip blocked, see row 13 | IN PROGRESS |
| 4 | Allow editing of section names, item names, comment text | `/templates/[templateId]` — a two-pane desktop editor: left-hand hierarchy tree (`template-tree.tsx`), main pane with debounced-autosave name fields (`editable-name-field.tsx`) and a scoped Tiptap rich-text editor for comments (`comment-editor.tsx`, bold/italic/underline/lists/link — matched exactly to the sanitizer allowlist) | Verified with a real headless-browser session against a mock template: typing → "Unsaved changes" → "Saving…" → (given no live DB yet) "Save failed" with the edit preserved, not cleared. Server actions in `src/lib/persistence/template-edit-actions.ts`; validated via `template-edit-validation.test.ts` (15 cases). Live round-trip blocked, see row 13 | IN PROGRESS |
| 5 | Persist edits in a real backend | Supabase Postgres tables for templates/sections/items/comments; edits write through Server Actions (`updateSectionName`/`updateItemName`/`updateCommentContent`), each server-side Zod-validated before touching the DB | `src/lib/persistence/template-edit-actions.ts` + `template-edit-validation.ts`; no schema change needed — edits use the same columns import already writes to. Live write blocked, see row 13 | IN PROGRESS |
| 6 | Duplicate a template and make the copy fully independent | `duplicate_template(uuid, text)` Postgres function deep-copies templates/sections/items/comments in one transaction, every row with a new id; lineage recorded as `templates.parent_template_id`. `import_runs`/`import_issues` are deliberately not copied — a duplicate isn't a fresh import (`docs/decision-log.md` D10). Dialog proposes "[Name] — Copy", name editable, states "The copy will be independent of the original"; on success it navigates to the copy | `supabase/migrations/20260916000000_template_duplication.sql`; `duplicate-template.ts` re-reads both templates post-commit and runs `verifyDuplicateIndependence` (D11). 14 unit tests in `verify-duplicate-independence.test.ts` cover proofs 1–5 (same content, all-new ids, and — via an id-keyed update simulation — that editing one tree can't reach the other); 9 more in `duplicate-template-validation.test.ts`. 5 skip-gated live-DB proofs in `duplicate-template.integration.test.ts`, with the manual SQL equivalent in `docs/db-verification.md`. Dialog behaviour browser-verified (proposed name, independence copy, failure keeps the typed name). Live run blocked, see row 13 | IN PROGRESS |
| 7 | Structured editable data model, not one opaque HTML blob | Canonical TS/Zod model (`CanonicalTemplate` → `CanonicalSection[]` → `CanonicalItem[]` → `CanonicalComment[]`); Postgres schema (`templates`/`sections`/`items`/`comments`, typed columns, FKs) mirrors it; the editor now proves it's genuinely editable at each level, not just readable | `src/lib/import/types.ts`; `supabase/migrations/20260915000000_import_pipeline.sql`; `/templates/[templateId]` edits section/item names and comment rich text independently, each its own row/field, never a single blob. Migration is written and reviewed but **not yet applied** to the live project — blocked, see row 13 | IN PROGRESS |
| 8 | Explain handling of formatting, links, and rich content | Documented rich-content policy (`docs/architecture.md` §5, extended by §5a's silent-normalization/recoverable/manual-review split, detailed further in `docs/spectora-format.md`) implemented as a `sanitize-html` allowlist plus a deterministic three-level classifier; explanation surfaced in NOTES.md and in-app import report (the "Automatic cleanup" line and the "Fix Safely" before/after preview) | `src/lib/import/rich-content.ts` + `rich-content.test.ts` (incl. `<img>`/`<table>`/`<iframe>` unsupported-content cases, safe/unsafe/changed link cases, and the new Level A/B/C split); NOTES.md's "Formatting / links / rich content" section documents the split explicitly; the Fix Safely apply path (`apply_issue_fix`, `supabase/migrations/20260918000000_safe_normalization.sql`) is unit-tested but not yet live-DB-verified, see row 13 | IN PROGRESS |
| 9 | Distinguish "not present in source" vs. "present but unsupported by our importer" | An item with a blank comment cell gets zero comments and no issue (absent); a comment the sanitizer had to alter raises `unsupported_formatting`/`unsupported_link` (unsupported by importer); the integrity engine keeps these as distinct source-coverage buckets. The Issue Review UI states the distinction explicitly in copy ("present in source but unsupported by this importer," never "not present in source" without an exact-row-match proof) and the hierarchy lookup (`buildHierarchyMap`) only ever claims a section/item match on an exact source-row match — no inference from neighboring rows | `hierarchy.test.ts` "absent in source, not an issue" case; `compute-integrity.test.ts` "unsupported row correctly accounted for" suite; `get-import-run-issues.ts` `buildHierarchyMap` (exact-match only, doc-commented); issue cards on `/imports/[importRunId]/issues` | IN PROGRESS |
| 10 | Importer must not be hard-coded to one sample export | Parser driven by structural detection (resilient header normalization + keyword scan, column-role mapping), not fixed row/column indices or literal template text. A dedicated generality suite asserts the shape is read from the file: 8 header wordings (plain, suffixed, parenthesised, punctuated, upper-case, 3 synonym sets), header not on row 1, arbitrary column order, extra unrecognized columns, multi-sheet workbooks, wide/deep/comment-heavy structures, blank-row row-number alignment, and byte-identical determinism across repeated parses | `extract-rows.ts` (`normalizeHeaderCell` + keyword synonyms, no hard-coded positions/filename); `parser-generality.test.ts` (20 tests); `parse-workbook.test.ts` "no fixed template shape". A source audit confirms no hard-coded template names, row counts, or source row numbers anywhere in `src/` | IN PROGRESS — still never run against a real export (row 16) |
| 11 | Demonstrate preservation verification | The deterministic Import Integrity Engine (`src/lib/integrity/`, THIS IS NOT AI): structure counts, ordering, whitespace-normalized text preservation, and link preservation, each compared source-parsed vs. Postgres-persisted, collecting every mismatch rather than stopping at the first. Reports one of four honest statuses (`verified` / `verified_with_warnings` / `review_required` / `failed`) — never a score (`docs/decision-log.md` D9) — persisted to `import_runs.integrity_status`/`integrity_result`, and rendered in full on `/templates/[templateId]/import-report` (every metric this requirement lists, plus the literal "N unaccounted source rows" phrase) | `src/lib/integrity/compute-integrity.ts` + `compute-integrity.test.ts` (20 cases) + `format-report.test.ts`; `src/app/templates/[templateId]/import-report/page.tsx` renders structure/coverage/ordering/text/links/formatting, all sourced directly from the persisted `IntegrityResult`, nothing computed client-side. Live round-trip blocked on row 13 | IN PROGRESS |
| 12 | Demonstrate at least one failure case | Ten failure modes are handled deliberately, each visible, understandable, recoverable where possible, and non-destructive — never a silent skip. **(1) Wrong file type** — extension check, plus a magic-byte container check so a renamed file is caught before SheetJS is handed arbitrary bytes. **(2) Empty workbook** — zero-byte and no-rows cases separated. **(3) Unrecognized structure** — no section/item/comment layout found; nothing imported, nothing partial. **(4) Missing hierarchy info** — an item before any section, or a comment before any item, is flagged `ambiguous_hierarchy` and kept, never dropped. **(5) Meaningful unknown row** — retained with its raw snippet and counted in source coverage; `unaccountedRows > 0` forces `review_required`. **(6) Unsafe HTML** — sanitized server-side on both import and edit, with `javascript:` links and disallowed tags flagged as issues rather than quietly removed. **(7) Persistence failure** — the write is one Postgres function call, so a failure leaves nothing partial; recorded as a `failed` `import_runs` row. **(8) Duplication failure** — same atomicity; the original is untouched and no half-copy survives. **(9) Save failure** — the edit stays on screen and is never cleared. **(10) AI unavailable** — `ai_unavailable` is reserved in the error model so an outage in the (not-yet-built) explanatory layer can never block import, edit, or duplicate. All ten map to a typed `AppError` (`docs/decision-log.md` D12) whose user-facing text is separate from the operator detail written to the server log. **Walkthrough demo: the renamed-file case (1)** — visibly the same `.xlsx` the reviewer expects, rejected on its contents with an honest reason. | `validate-file.test.ts` (16 cases incl. magic-byte/renamed-PDF); `app-error.test.ts` (16 cases, incl. proof no internal detail reaches the browser); `route.test.ts` (9 cases incl. the pre-buffering size guard); `template-edit-actions.test.ts` (13 cases incl. server-side sanitization and save-failure behaviour); `parse-workbook.test.ts` failure suites; `hierarchy.test.ts` ambiguous-hierarchy cases; `import-service.ts` `recordFailedRun`; `compute-integrity.test.ts` count/order-mismatch cases; live-DB assertion in the skip-gated integration test | DONE (unit-verified; live-DB paths blocked on row 13) |
| 13 | Use a real backend/database | Supabase Postgres: schema + atomic `import_template()`, `duplicate_template()`, and `apply_issue_fix()` RPCs + integrity-result columns + issue resolution-status/fix-safely workflow, written as six migrations; service-role client (`src/lib/supabase/server-client.ts`) used server-only | Migration files (`supabase/migrations/20260915000000_import_pipeline.sql`, `20260915010000_import_integrity.sql`, `20260915020000_import_issue_resolution.sql`, `20260916000000_template_duplication.sql`, `20260917000000_ai_audits.sql`, `20260918000000_safe_normalization.sql`) + `import-service.integration.test.ts` and `duplicate-template.integration.test.ts` (both skip-gated); `docs/db-verification.md` gives the copy-pasteable manual equivalent. `SUPABASE_SERVICE_ROLE_KEY` is now populated and the first five migrations have been applied to the live project (verified via a PostgREST schema listing — all 7 pre-existing tables and 2 functions present). **Still BLOCKED** on the sixth migration (`20260918000000_safe_normalization.sql`, added with the Fix Safely feature) — apply it the same way (Supabase SQL Editor) before that feature can persist anything | BLOCKED — awaiting the sixth migration's application |
| 14 | Public deployment must work on Vercel | The app is prepared and verified deployment-ready, documented step by step in `docs/deployment.md` (create Supabase → run migrations → seed → configure Vercel env → deploy → verify). Every route declares `export const runtime = "nodejs"`; `xlsx` confirmed pure JavaScript (no native bindings); zero filesystem or localStorage dependency in the deployed app; no hardcoded localhost/dev URLs. A genuine, previously-undetected bug was found and fixed in this pass: Vercel enforces a hard, non-configurable 4.5MB request body limit on every plan (verified against current Vercel docs), but this app advertised and accepted uploads "up to 20MB" — any file 4.5–20MB would have failed with an opaque platform `413`, never reaching this app's own honest error. Limit lowered to 4MB everywhere, derived from one constant so it can't drift again (`docs/decision-log.md` D15) | `npm run build` succeeds; `.next/static` scanned and confirmed free of the service-role key and all other secrets; `.env.example` audited against every actual `process.env` reference in the codebase; `src/app/api/health/route.ts` (5 tests) gives a fast, no-UI-click-through way to distinguish "misconfigured" from "no data yet" post-deploy; `docs/deployment.md`'s production smoke checklist. **No actual deployment was performed** — no Vercel credentials are available in this environment, and none were configured, per the explicit instruction not to deploy automatically without them | TODO — repo is deployment-ready; the deploy itself, and rows 13/15/16 it depends on, remain the project owner's to perform |
| 15 | Live app must already contain an imported template reviewers can explore | The full exploration path exists and is exercised end to end by `tests/e2e/migration-workflow.spec.ts`: Templates dashboard (`/`) → template → Import integrity report → Issue Review — all reading live Supabase (`force-dynamic`, no build-time snapshot), zero auth/login anywhere (verified: no login/auth pages, no middleware, no auth dependency in the repo). `npm run seed` is the repeatable seeding mechanism (`scripts/seed-demo.ts`) — it calls `runSpectoraImport`, the exact function `POST /api/import` calls, never a hand-built row. It is idempotent (skips if a successful run already matches the source file's sha256) and has a scoped `--reset` that deletes only its own seeded run/template, never a blanket wipe. **It has not been run against the live project from this session** — blocked on both row 13 (service role key empty, migration-application state from here unknown) and row 16 (no real file to seed with) | `scripts/seed-demo.ts` (thin CLI) + `src/lib/seed/classify-sample-files.ts` + `src/lib/seed/seed-demo-template.ts` (18 unit tests covering idempotency, reset scoping — including a test that a reviewer's own duplicate is never touched — and pass-through to the real importer); manually run against local `.env` and confirmed to (a) correctly detect the missing-real-export case and refuse to seed, (b) correctly resolve and attempt the synthetic path under `--allow-synthetic`, failing honestly on the still-missing service-role key, (c) report "nothing to reset" cleanly. A live successful seed has never been observed | BLOCKED — awaiting rows 13 and 16 |
| 16 | Repo must include the Spectora sample export actually used | Real export committed under `sample-data/spectora/`, unmodified, with a required-disclosure table in the README (template name, Spectora source, export method, PII confirmation) that must be filled in when the file is added | File present in repo at that path (currently: not yet provided). `sample-data/spectora/README.md` now states this is a submission BLOCKER in its own heading, not just a note, and gives the exact four fields that must be filled in | BLOCKED — awaiting real export file |
| 17 | README must contain setup, DB setup, and environment instructions | Root `README.md`, 21 numbered sections: overview, customer problem, what was built, live URL (placeholder — see row 15), reviewer instructions, supported input, tech stack, an architecture diagram, data model summary, import pipeline, Import Integrity approach, rich-content policy, failure behavior, AI Auditor scope, local setup, Supabase initialization, environment variables, running tests, seeding, deployment, repository structure | Every section cites the real file paths and current facts it describes (test counts, migration filenames, exact env var names) rather than generic placeholder prose; cross-checked against `package.json`, the actual `supabase/migrations/` listing, and every `process.env` reference in the codebase before being written | DONE |
| 18 | NOTES.md must explain cuts, supported input, limitations, verification approach, time spent, credits | Root `NOTES.md`, written last, after implementation substantially complete, in first person as the actual engineering record: what was prioritized and why, explicit cuts (report writing, scheduling, payments, homeowner portal, mobile app, full Spectora parity, AI-based primary mapping), precise supported input, known limitations stated without hedging, exact formatting/links/rich-content behavior, the missing-vs-unsupported distinction, how the work was checked, an AI-use disclosure, credits, and explicitly-marked placeholders (never fabricated content) for time spent and product-exploration observations | `NOTES.md` present; time-spent and product-exploration (Hive/Spectora/Binsr) sections are honestly left as `<!-- TODO -->` placeholders for the project owner to fill in with real numbers and real first-hand observations, per explicit instruction not to invent either | DONE — two sections deliberately left as owner-only placeholders, see below |
| 19 | AI inside the product is optional, implemented only after baseline is complete | Built last, after rows 1–12 were implemented and verified. Optional in the strong sense: `AI_AUDITOR_ENABLED` defaults to `false`, and with no key the app runs the complete assessment — import, edit, duplicate, persist, integrity report — showing "AI review is unavailable. Your deterministic import integrity report is unaffected." `requestAiAudit` checks for a provider *before* touching Supabase, so the disabled path needs no database either | `src/lib/ai/`; `.env.example` (AI section documented as entirely optional); `run-audit.test.ts` "disabled" suite proves no provider is called and no row is written; `docs/ai-auditor.md` | DONE |
| 20 | AI must never silently modify source content or become the source of truth for import correctness | Four independent barriers, not one: **(a)** it runs after the deterministic report has already rendered and persisted, as a client component below the metrics — it cannot delay or replace them; **(b)** it cannot see template content at all (`buildAuditPayload` sends counts/statuses/category keys/row numbers/issue ids and our own authored descriptions — never section names, item names, comment text, raw snippets, per-issue explanations, or the filename); **(c)** output passes a `.strict()` Zod schema with no field for counts or status, so replacement content, restated counts, invented statuses, or SQL fail validation outright, plus an issue-id allowlist that rejects the whole response on a fabricated id; **(d)** no write path — it writes one `ai_audits` row and nothing else, and `ai_audits` is a schema leaf with no FK or trigger reaching template tables | `src/lib/ai/audit-payload.ts` + `audit-payload.test.ts` (plants a fake homeowner name/address in every content field, asserts neither reaches the payload); `audit-schema.ts` + `audit-schema.test.ts` (rejects replacement content, restated counts, SQL, invented status, extra keys); `run-audit.test.ts` (asserts only `ai_audits` is ever written, never throws, never mutates the integrity result); `supabase/migrations/20260917000000_ai_audits.sql`; `docs/ai-auditor.md` | DONE |

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
- Row 12 moved to **DONE** (unit-verified) in the reliability/security pass.
  The substance of that pass was less about adding failure handling than about
  making the failures honest at the edges. Three real gaps were found and
  closed. (1) **Internal detail was being rendered to anonymous visitors.** Six
  call sites returned a raw `error.message` straight into the page — on a
  public, unauthenticated deployment that told any visitor which environment
  variables were missing or which Postgres table didn't exist. All six now go
  through `toAppError`, which logs the original server-side and returns a typed,
  safe `AppError` (`docs/decision-log.md` D12). (2) **A file's extension was
  being taken as evidence of its contents.** `validateFile` now checks the ZIP
  / OLE2 container signature, so a renamed file is rejected before SheetJS is
  handed arbitrary bytes. (3) **The upload size limit was enforced too late** —
  `request.formData()` buffers the whole body into memory, so the in-parser
  limit only applied after a large POST had already been read; the route now
  rejects on `Content-Length` first, with the real `file.size` as the backstop
  for chunked uploads that declare none. Row ids were also tightened from
  "non-empty string" to `uuid`, since every id in the schema is a Postgres
  `uuid` and anything else is invalid by definition — it fails now with a clear
  message instead of an opaque database type error.
- Error presentation changed shape in the same pass: `ErrorState` takes the
  typed `AppError` and renders `message` and `recovery` as two distinct things,
  because "what went wrong" and "what you can do about it" are different
  questions and running them into one sentence buries the answer to the second.
  A failed import now also links to the import run's issue list where one was
  recorded, so a rejection is inspectable down to the responsible rows rather
  than being a dead end.
- Rows 19 and 20 moved to **DONE** with the AI Import Auditor
  (`src/lib/ai/`, 50 tests, `docs/ai-auditor.md`). The one-line statement of
  the design is: *AI failure can degrade explanation, but cannot corrupt
  migration.* The feature sits strictly downstream of a completed, verified,
  persisted integrity result and describes it. The dangerous position — between
  the source file and the database — is held by deterministic code, and the
  auditor does not touch it.
  Two choices there are worth flagging because the obvious alternative is
  worse. First, the model is sent **no customer content whatsoever**, not even
  issue explanations (which can embed an item name). The thing being explained
  is numeric and categorical, so content adds no explanatory value and would be
  pure risk. Second, a response referencing an invented issue id is rejected
  **entirely** rather than having the bad id filtered out: a model that
  fabricated an id isn't tracking the data it was given, so its prose is
  suspect too, and silently dropping the id would hide the very signal worth
  acting on.
- A baseline defect was found and fixed while verifying before that work, by
  running the real endpoint rather than trusting the unit tests. `runSpectoraImport`
  created the Supabase client *before* parsing, so an unparseable upload —
  a `.txt`, or the renamed-file case row 12 nominates for the walkthrough demo —
  threw on the missing client and was reported as "This workspace isn't finished
  setting up yet" with a 500, blaming the server for the user's wrong file. File
  diagnosis is pure deterministic work and now happens first; recording the
  failed run is best-effort and cannot change what the person is told.
  Regression-tested in `import-service.test.ts` (7 cases), including that the
  audit write failing still yields the honest file error.
- A quality pass against requirement 10 (audit the parser for sample-specific
  assumptions) found **two real defects by probing the code rather than reading
  it**, both now fixed and regression-tested in `parser-generality.test.ts`.
  - **Only the first recognizable sheet was ever parsed.** Every later sheet was
    discarded with no issue raised and its rows absent from `sourceRowRecords` —
    so the integrity engine saw nothing missing and would have reported
    "Verified — nothing unaccounted for" over a silently dropped sheet. A
    two-sheet probe imported 1 of 3 rows and produced **zero** issues. This was
    the worst failure the product can have: a silent drop that also defeats the
    check built to catch silent drops. All sheets are now parsed and merged
    (hierarchy built per sheet so a section can't absorb rows across a sheet
    boundary, then positions renumbered globally); a content-bearing sheet with
    no recognizable header is reported as an issue with a content sample.
  - **One column could be assigned two roles.** A header like `"Item Text"`
    matches the `item` keyword *and* the `comment` keyword (`"text"`), so the
    same cell was imported twice — as the item's name and again as a comment
    beneath it. Any export using that wording would have had every item name
    duplicated as a comment. Columns are now claimed exclusively,
    most-specific-first.
- Row 11's evidence strengthened in the same pass: text preservation had only
  ever been asserted in the *passing* direction. The failure direction — that a
  corruption is actually detected — is now covered for replaced, truncated and
  emptied text, altered section and item names, and punctuation changes, plus
  an assertion on `comparedCount` so "verified" can't quietly mean "compared
  nothing".
- Testing is documented end to end in `docs/testing.md`: automated checks,
  manual checks still required, sample exports used, the four-way preservation
  validation strategy, and an explicit coverage-gaps list.
- Playwright browser smoke tests cover the 9-step reviewer walkthrough
  (`tests/e2e/migration-workflow.spec.ts`). Steps 1 and 9 need no database and
  **run and pass now** (5 tests); steps 2–8 are gated behind `E2E_LIVE_DB=true`
  and skip with a stated reason rather than failing, since row 13 is still
  blocked. Kept deliberately thin — Vitest owns correctness.
- A product-design pass polished every screen (dashboard, import, import
  report, issue review, editor, duplicate dialog, error/loading/empty states)
  against one intent: professional B2B SaaS, calm, desktop-first, minimal
  noise. The import report's "N unaccounted source rows" claim (requirement
  11) now gets a dedicated hero component with a proportional coverage bar,
  and warning-tier findings are visually distinguished (amber) from genuine
  failures (red) rather than sharing one alarming red. Fixed a real
  inconsistency: the page header and the page body used two different
  max-widths (`max-w-7xl` editor vs `max-w-6xl` everywhere else), now unified
  behind one exported `CONTENT_WIDTH` constant. Added route-shaped loading
  skeletons for the editor, report, and issue pages, which previously all
  fell back to a dashboard-shaped skeleton that visibly didn't match.
  Accessibility was verified with real Playwright specs, not by inspection —
  `tests/e2e/accessibility.spec.ts` caught and fixed a missing `<main>`
  landmark (present on every route now) and two file inputs with no
  accessible name. `tests/e2e/responsive.spec.ts` confirms no horizontal
  overflow at 1280px and 1024px (13" laptop and narrower). Every new
  component added in this pass is a server component — zero client JS added.
- Rows 15/16's seeding machinery is now fully built (`npm run seed`,
  `docs/decision-log.md` D14) but deliberately **not** wired to a UI button.
  A "Reset demo data" control was considered per the task brief and rejected:
  this app has zero authentication by design (row-level "no login friction"
  requirement), so any mutating Server Action reachable from the deployed UI
  is reachable by every anonymous visitor. A CLI flag that only someone with
  repo access and the service-role key can run is a fundamentally different
  risk than a button one misconfigured env var could expose to the public
  internet. The CLI already satisfies "idempotent or safely reset its own
  known demo records" without that risk, so the safer option was taken rather
  than building the riskier one because it was merely possible.
- Row 14's deployment-preparation pass found a real bug the way the earlier
  hardening passes did — by checking a claim against reality rather than
  trusting it. The app's own upload UI said "up to 20MB"; Vercel's platform
  says 4.5MB, on every plan, not configurable. That's not a corner case —
  it's the file-size ceiling for every single upload, and it would have
  produced an opaque platform error instead of this app's carefully-built
  `AppError` model for any file between 4.5MB and 20MB. Fixed by lowering
  `MAX_FILE_SIZE_BYTES` to 4MB and, more importantly, making every place
  that used to hardcode "20MB" as a separate string (the dropzone copy, the
  error catalog message) derive from that one constant instead — the same
  drift-prevention principle applied throughout this project's error
  handling.
- Rows 17/18 moved to **DONE** with `README.md` and `NOTES.md`, both written
  for a reviewer to actually use rather than to satisfy a checklist. Two
  honesty constraints were held throughout: `README.md` §4 (Live URL) is a
  visible, unmissable placeholder rather than an invented link, and
  `NOTES.md`'s Time Spent and Product Exploration (Hive/Spectora/Binsr)
  sections are explicitly marked `<!-- TODO -->` for the project owner to
  fill in with real numbers and real first-hand product research — neither
  was fabricated, per direct instruction. `docs/ai-development-workflow.md`
  is new alongside them: the actual disclosure of how this project was built
  with Claude Code (phased prompting, the verification gate run after every
  phase, and the specific real bugs that real execution — not code review —
  caught along the way). `CLAUDE.md` is kept, not superseded, as the
  document every phase of this project actually operated under.
  `.claude/commands/verify-assessment.md` is a new slash command that
  re-runs the verification gate and cross-checks the real current blocker
  state (sample export present, service-role key set, live URL filled in)
  against what this table claims, rather than trusting the table's prose —
  useful for confirming this table hasn't gone stale after further work.
- This table should be updated as part of the same change that satisfies a row,
  not in a separate "update docs" pass.
- **Safe Normalization / Recoverable Content / Manual Review split**
  (`docs/architecture.md` §5a, `docs/decision-log.md` D16). Before this pass,
  every tag outside the sanitizer allowlist — a bare, meaningless `<div>`
  wrapper exactly as much as a stripped `<table>` — raised the identical
  `unsupported_formatting` warning, which taught reviewers to ignore the
  category entirely. Three levels now exist: **silent** (whitespace, empty
  tags, standard entities, `b`→`strong`/`i`→`em`, and an attribute-free
  `<div>`/`<span>` wrapper — provably meaning-preserving, logged internally
  as a typed `NormalizationEvent` but never shown as a warning); **recoverable
  "Fix Safely"** (the same wrapper tags WITH an attribute — mechanically
  identical and still provably text-preserving, but held for a reviewer's
  explicit before/after-preview confirmation rather than applied
  automatically); and **manual review** (tables, images, embeds, scripts —
  unchanged from before this pass, no fix ever offered). The dividing line
  between silent and recoverable is one deterministic, checkable fact — does
  the wrapper carry an attribute — not a judgment call, and a field with any
  genuinely unsupported tag mixed in always falls through to manual review
  rather than offering a partial fix. New: `normalization_events` table
  (best-effort write, same posture as the AI auditor's own writes — losing
  this purely-informational log can never fail an otherwise-successful
  import) and `apply_issue_fix(uuid)` (one atomic Postgres function; it
  replays the exact `proposed_plain_text`/`proposed_safe_html` computed and
  shown to the reviewer at import time, never content recomputed fresh at
  apply time, so "what was approved" and "what got applied" are the same
  string by construction). 37 new/changed tests across
  `rich-content.test.ts` (32 cases covering all three levels), `hierarchy.test.ts`,
  `compute-integrity.test.ts` (including the exact "text lost inside
  formatting tags must still fail" scenario), `issue-presentation.test.ts`,
  `import-payload.test.ts`, `import-service.test.ts`, and
  `issue-fix-actions.test.ts`. The Import Report gained a collapsed,
  non-alarming "Automatic cleanup" line (only rendered when normalizations
  actually occurred); the Issue Review page gained a "Fix Safely" button that
  opens a before/after preview and never mutates anything before the
  reviewer clicks "Apply fix". This is the sixth migration
  (`20260918000000_safe_normalization.sql`) and, like the first five before
  it, needs to be applied to the live project before it can persist anything
  — see row 13.
