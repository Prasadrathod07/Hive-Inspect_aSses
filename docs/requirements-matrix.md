# Requirements Matrix

Tracks every assessment requirement against its planned implementation and the
evidence that will prove it's satisfied. Status starts at `TODO` for all rows and
should be updated in place as work lands — this file is the single source of
truth for "are we done yet," not a summary written after the fact.

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

| # | Requirement | Planned Implementation | Evidence / Test | Status |
|---|---|---|---|---|
| 1 | Import a Spectora "Export to spreadsheet → Export HTML Text" spreadsheet | XLSX upload → SheetJS parse → deterministic normalizer that understands the HTML-text export's row/column structure (section rows, item rows, comment cells) | Vitest unit tests over parser with the real sample file; manual upload in the running app | TODO |
| 2 | Preserve text, hierarchy, and ordering | Hierarchy builder assigns stable order indices per section/item as encountered; canonical model preserves source order, not re-sorted | Round-trip test: parsed order == source row order; snapshot test on hierarchy tree | TODO |
| 3 | Never silently drop unsupported/skipped content | Every source row/cell is either mapped into the canonical model or recorded in an "unsupported/skipped" ledger with a reason code | Test asserts `parsed rows == mapped rows + skipped rows` for every fixture | TODO |
| 4 | Allow editing of section names, item names, comment text | Template editor UI with inline edit for these three fields, backed by server actions/route handlers | Playwright (or manual) flow: edit a name, reload, see it persisted | TODO |
| 5 | Persist edits in a real backend | Supabase Postgres tables for templates/sections/items/comments; edits write through server actions | Integration test hitting real Supabase (or documented local/staging project) | TODO |
| 6 | Duplicate a template and make the copy fully independent | "Duplicate" action deep-copies all rows with new IDs/foreign keys, no shared references to the source template | Test: edit the duplicate, assert original is unchanged | TODO |
| 7 | Structured editable data model, not one opaque HTML blob | Postgres schema: `templates`, `sections`, `items`, `comments` (or equivalent) with typed columns, not a single HTML/JSON blob column | Schema file + Zod types reviewed in `docs/architecture.md`; DB inspection | TODO |
| 8 | Explain handling of formatting, links, and rich content | Documented rich-content policy (see `docs/architecture.md` §5) + sanitizer allowlist; explanation surfaced in NOTES.md and in-app import report | NOTES.md section + code comment/config for sanitizer allowlist | TODO |
| 9 | Distinguish "not present in source" vs. "present but unsupported by our importer" | Two distinct status fields/badges in the data model and UI: `absent_in_source` vs. `unsupported_by_importer` | Test fixture exercising both cases; UI screenshot showing distinct badges | TODO |
| 10 | Importer must not be hard-coded to one sample export | Parser driven by structural detection (header patterns, cell roles), not literal string matches on the one sample file's content; tested against a second, differently-shaped fixture | Vitest run against ≥2 structurally distinct fixtures (real sample + synthetic variant) | TODO |
| 11 | Demonstrate preservation verification | Deterministic integrity engine computes source-row-count vs. imported-row-count reconciliation, per section, surfaced as an import report | Integrity report test + UI screen showing verification results for the imported sample | TODO |
| 12 | Demonstrate at least one failure case | A deliberately malformed/edge-case fixture (e.g. malformed HTML cell, missing section header) that the importer handles with a clear, honest error/skip rather than a crash or silent loss | Vitest test asserting graceful handling + visible report entry for the failure fixture | TODO |
| 13 | Use a real backend/database | Supabase Postgres, provisioned (see `.env`), used in both local dev and the deployed app | `DATABASE_URL`/Supabase env vars documented in README; live app queries real DB | TODO |
| 14 | Public deployment must work on Vercel | Next.js App Router app deployed to Vercel, env vars configured in Vercel project settings | Live Vercel URL, verified working end-to-end | TODO |
| 15 | Live app must already contain an imported template reviewers can explore | Seed/import step run against production Supabase before final submission, using the real sample export | Live URL lands on or links to a pre-imported template | TODO |
| 16 | Repo must include the Spectora sample export actually used | Real export committed under `sample-data/spectora/` | File present in repo at that path (currently: not yet provided — see `sample-data/spectora/README.md`) | BLOCKED — awaiting real export file |
| 17 | README must contain setup, DB setup, and environment instructions | Root `README.md` with prerequisites, install, Supabase setup, env vars, run/test commands | README reviewed against a clean-machine checklist | TODO |
| 18 | NOTES.md must explain cuts, supported input, limitations, verification approach, time spent, credits | Root `NOTES.md`, written last, after implementation is substantially complete | NOTES.md present and complete before submission | TODO |
| 19 | AI inside the product is optional, implemented only after baseline is complete | AI Auditor deferred to its own final phase in `docs/work-plan.md`, behind the deterministic baseline | Work plan phase ordering; AI code doesn't exist until baseline phases are DONE | TODO |
| 20 | AI must never silently modify source content or become the source of truth for import correctness | AI Auditor is read-only over integrity engine output; no write path from AI to template tables | Code review checklist item + architecture doc constraint (§7) | TODO |

## Notes on this table

- Row 16 is currently **BLOCKED**: no Spectora export exists anywhere in this
  repository. This must be resolved before requirements 1, 2, 11, 15, and 16 can
  be verified against real data. See `sample-data/spectora/README.md`.
- Rows 11 and 12 depend on the integrity engine and at least one intentionally
  broken fixture existing — both are implementation work, not just documentation.
- This table should be updated as part of the same change that satisfies a row,
  not in a separate "update docs" pass.
