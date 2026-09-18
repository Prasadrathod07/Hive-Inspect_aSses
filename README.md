# Hive Template Migrator

A migration tool that imports a Spectora inspection template — exported as
"Export to spreadsheet → Export HTML Text" — into a structured, editable,
persisted template, without ever losing or silently altering the customer's
original content.

Built for the Hive Inspect Forward Deployed Engineer hiring assessment.

---

## 1. Project overview

Inspection companies build their template — the sections, items, and
boilerplate comment language an inspector works from on every job — over
years of real field use. When they switch software, that template has to
come with them. This tool takes one Spectora export and turns it into an
editable, persisted, structured template in a new system, with a
deterministic engine that proves — not just claims — nothing was lost in the
move.

The differentiator this project is built around is **Import Integrity**: a
plain, non-AI engine that re-reads what was actually written to the database
after import and reconciles it against what was parsed, so "nothing was
lost" is a checked fact with a paper trail, not a claim taken on faith.

## 2. Customer problem

An inspection company is migrating their inspection template from Spectora
to new software. That template represents years of accumulated,
field-tested work — section structure, item lists, and boilerplate comment
language refined over hundreds of real inspections. **They will not manually
recreate it.** A migration tool that silently drops a paragraph, reorders a
section, or mangles a link isn't a time-saver; it's a liability, because
nobody will notice the loss until it matters on a real job months later.

The tool's job is narrow and specific: import that one file faithfully,
prove it did, make the result editable, and be honest — immediately and
specifically — about anything it couldn't handle.

## 3. What was built

- A **deterministic Spectora parser** (`src/lib/import/`) — no LLM anywhere
  in the import path — that reads the structural shape of an "Export HTML
  Text" spreadsheet by keyword and header detection, not by hard-coded row
  or column positions.
- A **structured, typed canonical model** (`CanonicalTemplate` →
  `CanonicalSection[]` → `CanonicalItem[]` → `CanonicalComment[]`) — never
  one opaque HTML blob — persisted to Postgres through one atomic write.
- A **deterministic Import Integrity Engine** (`src/lib/integrity/`) that
  re-reads the persisted template post-commit and reconciles it against the
  parse, reporting one of four honest statuses — never a fabricated
  percentage.
- A real **template editor** (section/item names, rich-text comments),
  autosaving to Postgres, with explicit save-state feedback.
- **Independent template duplication**, with a post-copy check that proves
  the copy shares no rows with the original.
- A **typed error model** covering ten distinct, deliberately-handled
  failure cases — nothing fails silently or with a raw stack trace.
- An **optional AI Import Auditor** that explains the deterministic report
  in plain language, architected so it structurally cannot see customer
  content, invent findings, or touch persisted data (§14).
- A **repeatable, tested seeding pipeline** (`npm run seed`) that imports the
  reviewer-facing demo template through the exact same code path a real
  upload uses.
- A prepared, verified **Vercel deployment path** (`docs/deployment.md`),
  including a real bug this project's own deployment prep caught before it
  could reach production (§20).

334 automated tests, no network, no database, run in under two seconds
(`npm test`). See `docs/testing.md` for what's covered and — just as
importantly — what isn't yet.

## 4. Live URL

> **`<!-- TODO: paste the deployed Vercel URL here before submission -->`**
>
> Not filled in. Deployment requires a real Spectora export
> (`sample-data/spectora/README.md` — currently the single blocking gap in
> this project) and a live Supabase project with migrations applied and
> `npm run seed` run against it. The app itself is deploy-ready — see
> `docs/deployment.md` — but no deployment has actually happened yet.

## 5. Demo / reviewer instructions

**Once the live URL above is filled in:** open it. No login, no setup —
open the URL and the seeded template is the first thing on screen: name,
integrity status, **Open** / **Import Report** / **Duplicate**. Click
through: Open → edit a section name → refresh (the edit survived) →
Duplicate → edit the copy → reopen the original (unchanged). Then try
uploading a `.txt` file at `/import` to see the failure path.

**Until then, run it locally** — this is real and available right now:

```bash
git clone <this-repo>
cd hive-template-migrator
npm install
cp .env.example .env       # fill in your own Supabase project (§16, §17)
npm run dev                # http://localhost:3000
```

Without Supabase credentials configured, every page still renders — with an
honest error state, never fake data or a crash. Fill in `.env` and the app
works end to end, including uploading and exploring the **synthetic** demo
fixture (`npm run seed -- --allow-synthetic` — clearly labeled as synthetic
wherever it's displayed; see §19).

## 6. Supported Spectora input

**Format**: Spectora's "Export to spreadsheet → Export HTML Text" option
(`.xlsx` or `.xls`), up to 4MB (Vercel's own platform request-body ceiling —
see §20).

**What's read from the file, precisely** — by structural detection, not
hard-coded position (`docs/spectora-format.md` has the full, numbered list
of assumptions this rests on):

- A header row identified by keyword (section/area/category,
  item/component, comment/narrative/finding/description/deficiency/
  observation/note/text/limitation), found anywhere in the first 15 rows of
  each sheet — not assumed to be row 1.
- Section/item hierarchy expressed on the same row, either blank-filled
  (grouped export) or repeated on every row — both conventions are handled.
- Comment cells containing literal HTML markup as their string value (what
  "Export **HTML Text**" implies).
- Every sheet in a multi-sheet workbook — not just the first one that
  parses.

**Important honesty note**: no real Spectora export has ever been fed
through this parser. Every rule above is a documented, stated *assumption*
about the format, verified only against a hand-built synthetic fixture that
mimics it — see §11's "known limitations" framing and
`docs/spectora-format.md`'s full assumption list with the open questions a
real file would answer.

## 7. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui (Nova preset) |
| Database | Supabase Postgres — real backend, no mock, RLS on with no policies (service-role only) |
| Validation | Zod, at every stage boundary (parse output, DB write payload, edit input, AI output) |
| Spreadsheet parsing | SheetJS (`xlsx`, from SheetJS's own patched CDN build — the npm registry version has unfixed vulnerabilities) |
| HTML sanitization | `sanitize-html`, explicit allowlist |
| Rich-text editing | Tiptap v3, toolbar scoped 1:1 to the server sanitizer's allowlist |
| AI (optional) | Anthropic Messages API, or any OpenAI-compatible endpoint (e.g. LiteLLM) — a plain `fetch` call either way, no SDK |
| Testing | Vitest (334 unit/integration tests), Playwright (browser smoke tests) |
| Deployment | Vercel |

Full rationale for each choice: `docs/decision-log.md` (D1–D16).

## 8. Architecture diagram

```
                                   Browser
                                      │
                                      │  no auth, no login
                                      ▼
                        ┌──────────────────────────┐
                        │   Next.js (App Router)    │
                        │                            │
   Upload .xlsx  ─────▶ │  POST /api/import          │
                        │    │                        │
                        │    ▼                        │
                        │  deterministic parser        │──── pure functions,
                        │  (src/lib/import/)            │     no I/O, no LLM
                        │    │                        │
                        │    ▼                        │
                        │  one atomic Postgres write   │───▶ ┌────────────────┐
                        │  (import_template RPC)       │     │ Supabase       │
                        │    │                        │     │ Postgres       │
                        │    ▼                        │◀──── │ (RLS on, no   │
                        │  re-read + reconcile          │     │  policies —   │
                        │  (Import Integrity Engine,    │     │  service-role │
                        │   src/lib/integrity/)         │     │  only)        │
                        │    │                        │     └────────────────┘
                        │    ▼                        │
                        │  Import Report / Editor /     │
                        │  Issue Review UI               │
                        │    │                        │
                        │    ▼ (below the report,        │
                        │       never blocking it)       │
                        │  AI Import Auditor  ─────────┼────▶ Anthropic API
                        │  (read-only, no template        │    (optional,
                        │   content sent, strict-         │     disabled by
                        │   schema-gated output)           │     default)
                        └──────────────────────────┘
```

The one architectural fact worth internalizing before reading any code: the
Import Integrity Engine runs **after** persistence and re-reads from
Postgres — it proves what the database actually has, not what the parser
merely intended to write. Full stage-by-stage breakdown: `docs/architecture.md`.

## 9. Data model summary

Structured, typed, relational — never a rendered document or HTML blob
(requirement 7).

```
templates      (id, name, source_filename, source_file_sha256,
                 parent_template_id?)          ← lineage for a duplicate
  └─ sections  (id, name, order_index, source_sheet, source_row_number)
      └─ items (id, name, order_index, source_sheet, source_row_number)
          └─ comments (id, plain_text, safe_html?, order_index,
                         link_metadata?, source_sheet, source_row_number)

import_runs    (id, template_id?, status, section/item/comment_count,
                 integrity_status?, integrity_result JSONB?, error_message?)
import_issues  (id, import_run_id, category, severity, source_sheet,
                 source_row_number, explanation, raw_snippet, imported_preview?)
ai_audits      (id, import_run_id, status, provider, model, risk_level?,
                 output JSONB?, failure_reason?)   ← leaf table, nothing
                                                       references it, no path
                                                       to template data
```

Every `sections`/`items`/`comments` row carries its own `source_sheet` +
`source_row_number` inline — no separate join table needed to answer "where
did this come from" for any node. Full schema:
`supabase/migrations/*.sql`; design rationale: `docs/architecture.md` §3.

## 10. Import pipeline

```
upload → file validation → SheetJS parse → structural row extraction
  → normalization (trim, classify mappable-vs-unsupported)
  → hierarchy builder (section/item/comment tree, stable order indices)
  → rich-content sanitization (§12)
  → canonical model → Zod schema validation
  → ONE atomic Postgres write (import_template RPC)
  → post-commit re-read
  → deterministic Import Integrity Engine (§11)
```

Each arrow is a real stage boundary with a well-defined input/output shape —
`src/lib/import/parse-workbook.ts` is the orchestrator; every stage before
it is a pure function, independently unit-tested
(`src/lib/import/*.test.ts`). The write to Postgres is a single PL/pgSQL
function call (`import_template(jsonb)`), not a sequence of client-side
inserts — a function body is one implicit transaction, so either the whole
template commits or none of it does (`docs/decision-log.md` D7). No
partially-imported template can ever become visible.

## 11. Import Integrity approach

The product's actual differentiator. A pure, deterministic function
(`computeIntegrityResult`, `src/lib/integrity/compute-integrity.ts`) — no
model call anywhere in it — that re-reads the just-committed template from
Postgres and checks, collecting every mismatch rather than stopping at the
first:

- **Structure counts** — source vs. persisted section/item/comment counts.
- **Ordering** — persisted order matches source order, gap-free.
- **Text preservation** — every name and comment compared via
  whitespace-normalized equality; a replaced, truncated, emptied, or
  punctuation-changed value is a real, detected mismatch (verified by tests
  that assert the *failure* direction, not just the passing one).
- **Link preservation** — every link's href/text, source vs. persisted.
- **Source-row coverage** — the core proof: every meaningful source row is
  classified `mapped`, `unsupported` (content existed, couldn't be placed),
  or `intentionally ignored with reason` (a specific structural cause is
  known). `unaccountedRows` is what's left over — **it must be 0** for a
  trusted import, and if it's not, the exact source rows responsible are
  named, never just a count.

Output is one of four honest, discrete statuses —
`verified` / `verified_with_warnings` / `review_required` / `failed` —
**never a blended score or invented percentage**
(`docs/decision-log.md` D9). The Import Report UI leads with the literal
count: "0 unaccounted source rows" when true, made genuinely hard to miss;
warnings are visually distinguished from failures rather than sharing the
same alarming red.

## 12. Rich-content policy

Comment cells in an "Export HTML Text" file are assumed to contain literal
HTML markup as their string value. The sanitizer allowlist
(`src/lib/import/rich-content.ts`, using `sanitize-html`) is exactly:

```
b, strong, i, em, u, br, p, ul, ol, li, a
```

- **Allowlisted tags** (bold, italic, underline, paragraphs, line breaks,
  lists, links) are kept verbatim.
- **Links**: `href` restricted to `http`/`https`; `rel="noopener noreferrer"`
  and `target="_blank"` enforced on render. An unsafe-scheme link (e.g.
  `javascript:`) has its href **unwrapped, not deleted** — the link stops
  being clickable and is flagged (`unsupported_link`), but its visible text
  is still customer-authored content and stays in `plainText`.
- **Everything else outside the allowlist** is handled by a three-level
  policy (`docs/architecture.md` §5a), not one blanket warning:
  - **Silently normalized, no warning**: a bare `<div>`/`<span>` wrapper with
    no attributes, whitespace noise, empty tags, standard HTML entities, and
    `b`→`strong`/`i`→`em`. Provably meaning-preserving, so never shown as a
    warning — but always logged internally as a typed `NormalizationEvent`
    (`normalization_events` table), surfaced as a small "Automatic cleanup —
    N harmless formatting differences were normalized" line on the Import
    Report.
  - **Recoverable ("Fix Safely")**: the same wrapper tags WITH an attribute
    (`class`, `style`, `id`, …) — mechanically identical and still provably
    text-preserving, but held for a reviewer's explicit confirmation via a
    before/after preview on the Issue Review page, since an attribute could
    (in principle) carry meaning this importer doesn't understand.
  - **Manual review (unchanged)**: `<script>`, `<img>`, `<table>`,
    `<iframe>`/video embeds, inline styles, or any other tag outside the
    allowlist — stripped and reported as `unsupported_formatting`, naming
    the exact tag(s) removed. No fix is ever offered for these; the
    surrounding plain text is never lost, only the disallowed markup.
- **Plain-text fidelity**: naive tag-stripping jams adjacent words together
  across a removed `<br>`/`<li>` boundary ("noted;recommend"). This is
  explicitly handled — those boundaries become whitespace before stripping,
  then whitespace runs collapse to one space.
- The exact same sanitizer allowlist is enforced on **edits** made in the
  UI, not just on import — the Tiptap toolbar only ever offers formatting
  the server would actually keep.

## 13. Failure behavior

Ten failure cases are deliberately handled — not just "an import can fail,"
but ten distinct, named ways it can, each visible, understandable,
non-destructive, and recoverable where possible:

1. Wrong file type (extension *and* magic-byte container check — a renamed
   file is caught before SheetJS ever sees it)
2. Empty workbook
3. Unrecognized spreadsheet structure
4. Missing critical hierarchy info (an item/comment appearing before its
   parent — flagged `ambiguous_hierarchy`, never silently mis-attached)
5. A meaningful row the parser can't place anywhere (retained with its raw
   text, counted in coverage)
6. Unsafe HTML (sanitized server-side, on import *and* edit)
7. Database persistence failure (atomic write — nothing partial survives)
8. Duplication failure (same atomicity guarantee)
9. Save failure during editing (the edit stays on screen, never discarded)
10. AI auditor unavailable (reserved in the error model — an AI outage can
    never block import, edit, or duplicate)

Every one of these maps to a typed `AppError` (`src/lib/errors/app-error.ts`)
with a safe, specific user-facing message and a separate, more detailed
message written only to the server log — never a raw stack trace shown to a
visitor, on a deployment that has no authentication. Full design rationale:
`docs/decision-log.md` D12.

## 14. AI Auditor

**What it does**: writes a plain-language explanation of the already-computed
deterministic Import Integrity result, for a non-technical inspector reading
the Import Report. Shows a risk level, a summary, a recommended-issues list
(only ever referencing real issue IDs), and which known limitations apply.

**What it does NOT do**:

- **Does not parse the source spreadsheet.** The deterministic parser owns
  import; the AI never touches raw file bytes.
- **Does not see customer content.** The payload sent to the model contains
  counts, statuses, category keys, row numbers, and issue IDs — never
  section names, item names, comment text, raw snippets, or the filename.
- **Does not compute or override the integrity result.** Its output schema
  has no field for counts or status — there's no slot in which it *could*
  disagree with the deterministic engine, by construction, not just by
  instruction.
- **Cannot invent findings.** Recommended issue IDs are checked against the
  real set supplied; a fabricated ID rejects the entire response, not just
  the bad ID.
- **Has no write path to template data.** It writes one row to a leaf table
  (`ai_audits`) that nothing else references, and nothing else.
- **Cannot break anything by failing.** Disabled, timed out, or returning
  garbage all degrade to one honest sentence below the (already-rendered)
  integrity report — import, edit, duplicate, and persistence are
  completely unaffected either way.

Disabled by default (`AI_AUDITOR_ENABLED` unset or `false`) — the app is
fully functional with zero AI configuration. Full design and the specific
schema/validation gates: `docs/ai-auditor.md`;
`docs/decision-log.md` D13.

## 15. Local setup

**Prerequisites**: Node.js 22.x (pinned in `package.json`'s `engines`
field — matches what this project has actually been built and tested
against), npm, a Supabase project (§16).

```bash
git clone <this-repo>
cd hive-template-migrator
npm install
cp .env.example .env
```

Then fill in `.env` (§17), initialize the database (§16), and:

```bash
npm run dev
```

Open `http://localhost:3000`. With no Supabase credentials configured, the
app still runs — every page shows an honest, specific error instead of
fake data or a crash, which is itself a useful thing to see once before
setting up real credentials.

## 16. Supabase / database initialization

1. Create a project at [supabase.com](https://supabase.com).
2. From **Project Settings → API**: copy the **Project URL** and the
   **service_role** key (not the `anon` key — see §17 for which is which).
3. From **Project Settings → Database → Connection string**: copy the URI
   for running migrations only (never used by the running app).
4. Apply all six migrations, **in this order**, via the Supabase SQL Editor
   (paste each file, run, confirm no error, move to the next) or
   `supabase db push` / `psql`:
   ```
   supabase/migrations/20260915000000_import_pipeline.sql
   supabase/migrations/20260915010000_import_integrity.sql
   supabase/migrations/20260915020000_import_issue_resolution.sql
   supabase/migrations/20260916000000_template_duplication.sql
   supabase/migrations/20260917000000_ai_audits.sql
   supabase/migrations/20260918000000_safe_normalization.sql
   ```
5. That's the entire schema setup — every table gets Row Level Security
   enabled with **no policies**, so only the service-role key (used
   server-side only) can read or write anything. There are no RLS policies
   to author, no auth tables to configure.

Manual SQL to verify the schema landed correctly, without running the test
suite: `docs/db-verification.md`. Full six-step deployment sequence
(this section is steps 1–2 of it): `docs/deployment.md`.

## 17. Environment variables

Full detail and Vercel-specific guidance: `.env.example` and
`docs/deployment.md` §4.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Public — an endpoint, not a credential |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | **Secret.** Server-only — never exposed to the browser (verified: absent from the production client bundle). Bypasses RLS entirely |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Not currently read by any code path in this app |
| `DATABASE_URL` | Local only | Migrations only (§16 step 4) — the running app never reads it; **never set this in a deployed environment** |
| `AI_AUDITOR_ENABLED` | No | `true` to enable the optional AI Auditor (§14); omit to ship without it |
| `ANTHROPIC_API_KEY` | Only if AI enabled, provider shape 1 | **Secret**, server-only |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | Only if AI enabled, provider shape 2 | **Secret** key + endpoint for an OpenAI-compatible gateway (e.g. LiteLLM); if both are set they take priority over `ANTHROPIC_API_KEY` |
| `AI_AUDITOR_MODEL` | No | Defaults to `claude-sonnet-5` (Anthropic) or `gpt-4o` (OpenAI-compatible) |
| `AI_AUDITOR_TIMEOUT_MS` | No | Defaults to `20000` |
| `RUN_SUPABASE_INTEGRATION_TESTS` | No | Local/CI test opt-in only (`1` to enable) — meaningless to the running app |

## 18. Running tests

```bash
npm test              # Vitest — 334 unit/integration tests, no network, no database
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm run build           # Next.js production build
npm run test:e2e         # Playwright browser smoke tests
```

All five must pass before any change is considered done — this project's own
working rule throughout (`CLAUDE.md` §5). Two Vitest integration test files
and 8 of 13 Playwright tests need a live, migrated Supabase database and are
skip-gated rather than left to fail red — see `docs/testing.md` for exactly
what's covered, what's skip-gated and why, and the honest coverage-gaps list
this project maintains rather than hides.

## 19. Seeding the demo template

```bash
npm run seed                          # real Spectora export in sample-data/spectora/
npm run seed -- --reset                # undo — deletes only this script's own seeded run/template
npm run seed -- --allow-synthetic       # local demo only — see below
```

`npm run seed` seeds the reviewer-facing template through the exact same
`runSpectoraImport` function `POST /api/import` calls — never a hand-built
database row. It's idempotent (a second run against the same file is a
no-op) and its reset touches only its own seeded rows, identified by the
source file's content hash — never a blanket wipe (`docs/decision-log.md`
D14).

**Bare `npm run seed` refuses to seed anything if no real Spectora export is
present** in `sample-data/spectora/` — it prints why and exits non-zero
rather than silently substituting synthetic data. As of this writing, no
real export exists in this repository (§6), so this hasn't happened yet.
`npm run seed -- --allow-synthetic` is a separate, explicit opt-in that
seeds the synthetic fixture under a template name that says "SYNTHETIC
DEMO" everywhere it's displayed — useful for exercising the demo mechanics
locally, but it does **not** satisfy the assessment's "live app must already
contain an imported template" requirement, and must not be left seeded in
the production database at submission time.

## 20. Deployment

Full six-step sequence with a copy-pasteable production smoke checklist:
**`docs/deployment.md`**.

One thing worth surfacing here rather than only in that document: preparing
for Vercel found a real, previously-undetected bug. Vercel enforces a hard,
non-configurable **4.5MB request body limit on every plan** — verified
directly against current Vercel documentation. This app had been advertising
and accepting uploads "up to 20MB," which would have failed with an opaque
platform-level error for any file over 4.5MB, never reaching this project's
own carefully-built, honest error handling. Fixed: the limit is now 4MB,
with headroom under the platform ceiling, and every place that used to
state the number separately now derives it from one constant
(`docs/decision-log.md` D15).

No deployment has been performed from this development environment — no
Vercel credentials were available or configured here, deliberately.

## 21. Repository structure

```
src/
  app/                      Next.js App Router — pages, API routes, Server Actions
    api/health/             Deployment health check (no secrets, just configured/reachable)
    api/import/              POST endpoint — the real upload entrypoint
    import/                  Upload UI
    templates/[templateId]/  Editor UI
    templates/[templateId]/import-report/   Import Integrity report UI + AI Auditor section
    imports/[importRunId]/issues/           Issue Review UI
  components/
    ui/                      shadcn/ui primitives
    patterns/                 App-specific composed components (status badges, error/empty states, ...)
    layout/                   Page shell, header
  lib/
    import/                   The deterministic parser — pure functions, no I/O
    integrity/                 The deterministic Import Integrity Engine
    persistence/                Server Actions + Supabase reads/writes
    ai/                          AI Auditor: payload builder, schema, provider, orchestrator
    errors/                       Centralized typed error model
    seed/                          Pure logic behind `npm run seed`
    supabase/                       Service-role client (server-only)
scripts/
  seed-demo.ts                CLI entrypoint for npm run seed
  generate-synthetic-fixture.ts   Regenerates the labeled synthetic test fixture
  generate-golden-fixture.ts       Regenerates the golden-JSON parser test fixture
  inspect-workbook.ts               Run against any .xlsx to inspect its structure —
                                      the tool to run the moment a real export arrives
supabase/migrations/          Six ordered SQL migrations — the entire schema
sample-data/spectora/         Where the real Spectora export belongs (currently empty — BLOCKER)
tests/
  e2e/                        Playwright browser smoke tests
  fixtures/                   The synthetic test fixture + its golden-output JSON
docs/                         See below — this project's actual engineering record, not
                                an afterthought
CLAUDE.md                     Engineering constitution — governs how work happens in this repo
NOTES.md                      What was prioritized, cut, and known-limited — read this next
```

**`docs/`** — each file is load-bearing, not decorative:

| File | What it's for |
|---|---|
| `architecture.md` | Full stage-by-stage pipeline + data model design rationale |
| `decision-log.md` | Every non-obvious engineering decision (D1–D15), with alternatives considered and why they were rejected |
| `spectora-format.md` | Every assumption the parser makes about the Spectora format, numbered, each tied to the code that depends on it |
| `requirements-matrix.md` | All 20 assessment requirements, tracked to DONE/BLOCKED with evidence — the single source of truth for "is this actually finished" |
| `testing.md` | What's automated, what's manually verified, what isn't verified yet — stated plainly |
| `ai-auditor.md` | The AI Auditor's full safety design |
| `deployment.md` | The six-step Vercel deployment sequence + production smoke checklist |
| `db-verification.md` | Copy-pasteable SQL to manually verify the schema/atomicity claims |
| `ai-development-workflow.md` | How this project was actually built with Claude Code — see there for the process behind everything above |
