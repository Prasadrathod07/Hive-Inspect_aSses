# Testing

How this project is verified, what it can't verify yet, and exactly what a
human still has to do by hand.

The guiding rule: **a test should be able to fail.** A check that passes
because it never really exercised anything is worse than no check, because it
buys confidence it hasn't earned. Several tests here exist specifically to
falsify a claim the product makes — that nothing was dropped, that text
survived, that a copy is independent.

## Commands

```bash
npm test          # Vitest — 334 unit/integration tests, no network, no database
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build     # Next.js production build
npm run test:e2e  # Playwright browser smoke tests
```

All four of the first commands must pass before any phase is called done.

## Automated checks

### Unit and integration — 334 passing, 7 skip-gated

| Area | File | Tests |
|---|---|---|
| **Parser** | | |
| Happy path, golden fixture, failure cases | `import/parse-workbook.test.ts` | 23 |
| Format generality (not tied to our sample) | `import/parser-generality.test.ts` | 20 |
| File validation, magic bytes, size | `import/validate-file.test.ts` | 15 |
| Rich content: HTML, links, unsafe markup | `import/rich-content.test.ts` | 11 |
| Hierarchy and ordering | `import/hierarchy.test.ts` | 8 |
| Text checksums | `import/checksum.test.ts` | 4 |
| **Integrity** | | |
| Counts, order, text, links, coverage | `integrity/compute-integrity.test.ts` | 29 |
| Issue grouping for display | `integrity/issue-presentation.test.ts` | 7 |
| Report formatting | `integrity/format-report.test.ts` | 3 |
| **Persistence / editor** | | |
| Edit actions, sanitization, save failure | `persistence/template-edit-actions.test.ts` | 13 |
| Edit validation | `persistence/template-edit-validation.test.ts` | 16 |
| Import service failure paths | `persistence/import-service.test.ts` | 5 |
| Import payload shaping | `persistence/import-payload.test.ts` | 6 |
| **Duplication** | | |
| Deep independence proofs | `persistence/verify-duplicate-independence.test.ts` | 14 |
| Duplicate validation | `persistence/duplicate-template-validation.test.ts` | 10 |
| **AI auditor** | | |
| Output schema + invented-id rejection | `ai/audit-schema.test.ts` | 22 |
| Orchestration and safe fallback | `ai/run-audit.test.ts` | 18 |
| Payload privacy boundary | `ai/audit-payload.test.ts` | 10 |
| **API / errors** | | |
| Route guards, size limits | `app/api/import/route.test.ts` | 9 |
| Error model, leak prevention | `errors/app-error.test.ts` | 10 |
| **Demo seeding** | | |
| Real/synthetic/ambiguous file resolution | `seed/classify-sample-files.test.ts` | 6 |
| Idempotency, scoped reset, real-import pass-through | `seed/seed-demo-template.test.ts` | 12 |
| **Deployment** | | |
| Health check: configured/reachable, no leaked errors | `app/api/health/route.test.ts` | 5 |

**Skip-gated (7):** `import-service.integration.test.ts` and
`duplicate-template.integration.test.ts` run against a live Supabase instance.
They skip unless `SUPABASE_SERVICE_ROLE_KEY` and an explicit opt-in variable
are set. They have never been run — see "Coverage gaps".

### What the parser tests actually cover

- **Hierarchy** — blank-filled grouping, values repeated on every row, an item
  before any section, a comment before any item, a section recurring later in
  the file, one section with 25 items, 25 sections with one item each.
- **Order** — explicit `position` indices asserted; ordering is a first-class
  property, not incidental array order. Positions stay globally sequential
  when sheets are merged.
- **HTML** — allowlisted formatting preserved verbatim; disallowed tags
  stripped with surrounding text kept; `<img>`, `<table>`, `<iframe>` flagged
  as unsupported rather than approximated; no word-jamming across `<br>` or
  list boundaries.
- **Links** — safe `http(s)` links preserved with metadata; `javascript:`
  dropped with visible text kept; altered URLs flagged; ampersand entity
  encoding does not false-positive.
- **Unknown rows** — content in unmapped columns is flagged with its raw text
  retained; a fully-unmappable row is a warning, not a silent skip; an
  unreadable *sheet* is reported with a content sample.
- **Unsafe content** — `<script>`, inline event handlers, and unsafe URL
  schemes, on import and on edit.
- **Malformed files** — empty, oversized, wrong extension, renamed
  non-spreadsheet (magic-byte check), no header row, no sheets, unparseable
  bytes.

### Format generality (requirement 10)

A reviewer is expected to upload a different export. `parser-generality.test.ts`
asserts the importer reads **shape from the file**, never from our sample:

- Eight header wordings: plain, suffixed (`Section Name`), parenthesised
  (`Comment (HTML)`), punctuated (`Comment/Narrative`), upper case, and three
  synonym sets (`Area`/`Component`/`Narrative`, `Category`/`Component`/
  `Observation`, `Notes`).
- Header not on the first row (preamble rows above it).
- Columns in any order.
- Extra unrecognized columns tolerated and reported.
- Multi-sheet workbooks.
- Structural variation: wide, deep, many comments per item.
- Blank rows preserved so source row numbers stay aligned.
- Determinism: identical bytes produce a byte-identical result.

### Browser smoke tests (Playwright)

`tests/e2e/migration-workflow.spec.ts`, Chromium, one worker.

Currently **5 passing, 8 skipped**. The skipped ones need a live database and
are gated on `E2E_LIVE_DB=true` rather than left to fail — a skip that states
its reason is honest; a red test everyone learns to ignore is not.

| Step | Status |
|---|---|
| 1. Open dashboard (renders, no client error, no leaked internals) | **runs now** |
| 9. Bad-file failure (renamed file, wrong extension, recovery) | **runs now** |
| 2. Import fixture | gated on live DB |
| 3. See import report (+ AI section never hides the metrics) | gated on live DB |
| 4. Edit template | gated on live DB |
| 5. Refresh and verify persistence | gated on live DB |
| 6. Duplicate | gated on live DB |
| 7. Edit copy | gated on live DB |
| 8. Confirm original unchanged | gated on live DB |

To run the full walkthrough once the database is live:

```bash
E2E_LIVE_DB=true npm run test:e2e
```

Playwright is deliberately thin. Vitest owns correctness; these exist only to
prove the wiring holds in a real browser. Browser automation is the most
expensive test to maintain per unit of confidence, so it gets the walkthrough
and nothing more.

## Preservation validation strategy

"Nothing was lost" is the product's central claim, so it is checked four
independent ways rather than asserted once.

**1. Golden-file comparison.** The synthetic fixture parses to a committed
canonical JSON, compared byte-for-byte. IDs are injected via
`createSequentialIdGenerator`, so the only way the comparison changes is if
parsing behaviour changed. This catches silent drift that per-field assertions
miss.

**2. Checksum text comparison.** Not presence checks — the actual text is
normalized for whitespace and compared. `compute-integrity.test.ts` asserts
the *failure* direction too: replaced text, truncated text, emptied text, an
altered section name, an altered item name, and a punctuation change all
produce `mismatch` and a `failed` status. Whitespace-only differences
deliberately do not, since they aren't content loss and would bury real
mismatches in noise.

**3. Source-row coverage.** Every meaningful source row is classified
`mapped` / `unsupported` / `ignored with reason` / `unaccounted`, and the four
always sum to the total — there is no fifth silent bucket. Any
`unaccountedRows > 0` forces `review_required` regardless of how clean
everything else looks.

**4. Post-commit re-read.** Integrity is computed by re-reading what Postgres
actually stored and reconciling it against what was parsed — not by inspecting
the in-memory object that was about to be written. A write being *designed* to
be correct isn't the same as observing that it was.

`comparedCount` is asserted explicitly so "verified" can never quietly mean
"compared nothing".

### Duplicate independence

Independence rests on one checkable fact: the original's and the copy's row-id
sets are **disjoint**. Every write in this app is keyed by row id (`.eq("id",
…)`), so an update aimed at one template provably cannot reach a row of the
other. `verify-duplicate-independence.test.ts` asserts content equality, id
disjointness, and — via an id-keyed update simulation — that editing one tree
cannot touch the other. This is re-checked at runtime after every real copy.

### AI safety

The auditor's tests assert what it *cannot* do: no customer content in the
payload (planted strings), invented issue ids rejected, replacement content and
restated counts rejected by a strict schema, never throws whatever the provider
returns, never mutates the integrity result, and only ever writes to
`ai_audits`. See `docs/ai-auditor.md`.

## Sample exports used

**There is no real Spectora export in this repository.** This is a known,
documented submission blocker (`sample-data/spectora/README.md`,
`docs/requirements-matrix.md` row 16).

| File | Nature |
|---|---|
| `tests/fixtures/synthetic-spectora-like.xlsx` | **Synthetic.** Generated by `scripts/generate-synthetic-fixture.ts`. Not real customer data, not a verified example of Spectora's format. |
| `tests/fixtures/synthetic-spectora-like.expected.json` | Golden canonical output for the above. |
| Edge-case workbooks | **Synthetic**, constructed inline in `parser-generality.test.ts`. |

Edge cases are built in-test rather than committed as binaries: a workbook
written as a literal table next to the assertion about it is reviewable in a
diff, whereas a committed `.xlsx` has to be opened to be understood.

No second file has been fabricated and presented as a Spectora export. Until a
real export exists, every parser test proves the parser handles *the shape we
assumed*, documented in `docs/spectora-format.md` — not that it handles real
Spectora output.

## Manual checks

### Required before submission — nobody has done these yet

These cannot be automated from this environment because the database is
unreachable here (`docs/decision-log.md` D7). Steps 1–4 below are exactly
`docs/deployment.md`'s six-step sequence; that document also has a
**production smoke checklist** to run after every deploy, not just the
first — this list doesn't repeat it.

1. **Apply all six migrations, in order**, via the Supabase SQL Editor:
   `20260915000000_import_pipeline` → `20260915010000_import_integrity` →
   `20260915020000_import_issue_resolution` →
   `20260916000000_template_duplication` → `20260917000000_ai_audits` →
   `20260918000000_safe_normalization`.
2. **Populate `SUPABASE_SERVICE_ROLE_KEY`** in `.env` (and in Vercel — see
   `docs/deployment.md`).
3. **Run the gated integration tests locally** (never against production):
   `RUN_SUPABASE_INTEGRATION_TESTS=1 npm test`, with `SUPABASE_SERVICE_ROLE_KEY`
   pointed at a real, migrated database. All 7 must pass.
4. **Run the full browser walkthrough**: `E2E_LIVE_DB=true npm run test:e2e`.
   All 13 must pass.
5. **Add the real Spectora export** to `sample-data/spectora/` and fill in
   the required-disclosure table in its README (template name, source,
   export method, PII confirmation).
6. **Run `npm run seed`** against production Supabase. It imports that file
   through the real pipeline and reports the resulting template id and
   integrity status — confirm both by opening the deployed app. Also confirm
   the parsed structure against the file opened in a spreadsheet program —
   section count, item count, spot-checked comment text. This is the only
   check that can confirm `docs/spectora-format.md`'s assumptions are true
   rather than plausible.
7. **Verify the deployed Vercel app** serves the seeded template on `/` with
   no login step, and that Open / Import Report / Duplicate all work against
   production Supabase.
8. **Confirm duplicate independence by hand** using the SQL in
   `docs/db-verification.md`.

### Judgement calls that stay manual

- **Does the import report read honestly to a non-technical person?** No test
  can assert tone. Read it as an inspector would.
- **Does the AI review ever contradict the deterministic report?** Enable the
  auditor against a real import and read both. The schema makes contradiction
  structurally impossible for counts and status, but prose can still mislead.
- **Accessibility**: keyboard-only traversal of the editor, and a screen-reader
  pass over the import report.
- **Is anything in the UI claiming support we don't have?** Re-read
  `KNOWN_LIMITATIONS` against what the interface implies.

## Coverage gaps

Stated plainly rather than papered over:

1. **No real Spectora export has ever been parsed.** Every parser test is
   against an assumed shape. This is the single largest gap and no amount of
   synthetic testing closes it.
2. **The live database has never been written to.** All 7 integration tests and
   8 of 13 browser tests have never executed. Atomicity, the RPC functions, RLS
   behaviour, and the post-commit re-read are verified by construction and
   review, not by observation.
3. **No AI provider has ever been called.** The auditor is tested entirely
   through a mock. Real model behaviour — whether it actually respects the JSON
   contract in practice — is unverified.
4. **The editor's browser behaviour is only partly covered.** Autosave,
   debounce, and the save-status aggregate were verified in an earlier
   throwaway Playwright session (which found two real bugs), but those checks
   aren't in the committed suite because they need a live database.
5. **No load or concurrency testing.** Two people editing one template, or a
   very large export, are untested.
6. **No visual regression testing.** Layout breakage would not be caught.
7. **`npm run seed` has never succeeded against a live database.** Its own
   logic (file resolution, idempotency, scoped reset) is unit-tested against
   a mocked client (18 tests), and it was manually run to confirm it fails
   honestly in the two states it's actually in right now — no real export,
   no service-role key — but a real seed, and therefore the actual reviewer
   first-open experience, has never been observed from this environment.
