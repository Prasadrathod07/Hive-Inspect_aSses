# Architecture

## 1. Conceptual Pipeline

```
Spectora XLSX
  → file validation
  → spreadsheet parser
  → normalization
  → hierarchy builder
  → safe rich-content processing
  → canonical template model
  → schema validation
  → atomic persistence in Supabase
  → re-read persisted template
  → deterministic integrity engine
  → template editor / import report
  → optional AI auditor
```

(Revised from the original sketch: the integrity engine runs *after*
persistence, not before. It compares the in-memory parsed template against
what was actually re-read from Postgres — that's the only way it can prove
the write itself didn't lose anything, not just that parsing succeeded. See
§2.8a.)

Each arrow is a real stage boundary: a stage consumes a well-defined input shape,
produces a well-defined output shape, and does not reach past its neighbors. This
keeps the pipeline debuggable one stage at a time and keeps the "what changed
between source and stored data" question answerable at each boundary.

## 2. Stage-by-Stage

### 2.1 File validation
Confirms the uploaded file is a well-formed XLSX, within size limits, and
readable by SheetJS. Rejects non-spreadsheet uploads with a clear error before
any parsing is attempted. This stage does not know anything about Spectora's
specific layout — it only validates "is this a spreadsheet."

### 2.2 Spreadsheet parser
Reads raw sheet(s) into rows/cells (via SheetJS). Understands the *structural*
conventions of a Spectora "Export to spreadsheet → Export HTML Text" file
(e.g. which columns/rows carry section headers vs. item rows vs. comment cells),
detected by structural signals rather than hard-coded literal text, so it isn't
tied to one sample file's exact wording (requirement 10). Output: an intermediate
"raw rows" representation, still close to the spreadsheet shape, with every row
tagged by role where recognized and left untagged where not.

### 2.3 Normalization
Cleans and standardizes the raw rows: trims whitespace, resolves merged-cell
artifacts, decodes HTML entities in text cells, and classifies each row/cell as
either mappable into the canonical model or as unsupported (with a reason code).
No content is discarded here — unsupported rows are carried forward as records,
not dropped.

### 2.4 Hierarchy builder
Walks the normalized, ordered rows and assembles the section → item → field/
comment tree, assigning stable order indices that mirror the source order
(requirement 2). This is where "hierarchy and ordering" as a requirement is
actually implemented — it is not implicit in array order alone, because arrays
get re-sorted by accident; explicit order fields make ordering a first-class,
testable property.

### 2.5 Safe rich-content processing
Spectora's "HTML Text" export embeds HTML fragments (bold/italic, line breaks,
links, possibly lists) inside comment/description cells. This stage:
- Sanitizes HTML using an allowlist-based sanitizer (strips scripts, event
  handlers, styles, and any tag/attribute outside an explicit allowlist).
- Normalizes the allowlisted subset (e.g. `<b>`, `<i>`, `<br>`, `<a href>`,
  `<ul>/<li>`) into the canonical model's rich-text representation.
- Anything outside the allowlist is not silently stripped — it's recorded as
  "unsupported formatting" against that field, satisfying requirement 8/9,
  even though the surrounding text is preserved.
- See §5 for the specific policy this assessment adopts for formatting, links,
  and rich content.

### 2.6 Canonical template model
The structured, typed representation of a template: sections, items, fields,
comments, each with a stable ID, order index, plain-text content, sanitized
rich-content (where applicable), and any unsupported/skip annotations. This is
the "structured editable data model" required by requirement 7 — never an
opaque HTML blob. This is also the shape the editor UI reads and writes.

### 2.7 Schema validation
Validates the canonical model against Zod schemas before it's allowed to reach
persistence. Catches structural bugs in earlier stages (e.g. an item with no
parent section, a negative order index) before they reach the database, and
gives a precise, typed error instead of a database constraint failure.

### 2.8 Atomic persistence in Supabase
The canonical model (post-validation) is written to Postgres by a single
Postgres function, `import_template(jsonb)`
(`supabase/migrations/20260915000000_import_pipeline.sql`), called once —
not a sequence of client-side inserts. A PL/pgSQL function body is one
implicit transaction: either the whole template (all sections, items,
comments, plus the `import_runs`/`import_issues` audit trail) commits, or an
error rolls back everything the call did, including the `templates` row
itself. No partially-imported template can ever become visible/queryable.
See `docs/decision-log.md` D7 for why this is the transaction strategy
instead of client-side compensating deletes.

### 2.8a Deterministic integrity engine — THIS IS NOT AI
`src/lib/integrity/` (`computeIntegrityResult`). A pure function — same
inputs always produce the same result, no model call anywhere in it — that
re-reads the just-committed template from Postgres and reconciles four
things it's given:

1. **the canonical parsed template** (what the parser produced, in memory)
2. **the persisted template** (re-read from Postgres, post-commit — a real
   round-trip proof, not a within-transaction snapshot)
3. **the import issue candidates** the parser raised
4. **the source-row records** — every meaningful row the parser saw in the
   original file (docs/spectora-format.md assumption 6 defines "meaningful":
   pure blank spacer rows don't count)

It checks, in order of severity:
- **Structure counts** — source vs. persisted section/item/comment counts.
- **Ordering** — persisted `order_index` values are a correct, gap-free
  sequence, and match what the parser computed.
- **Text preservation** — every section/item name and comment's plain text
  and safe HTML, compared via whitespace-normalized equality
  (`src/lib/import/checksum.ts`), collecting *every* mismatch found rather
  than stopping at the first (a real difference is never hidden by an early
  return).
- **Link preservation** — every comment's link metadata, source vs. persisted.
- **Formatting warnings** — surfaced directly from `unsupported_formatting`
  issue candidates.
- **Source-row coverage** — the requirement-3/12 proof: every meaningful row
  is classified as `mapped`, `unsupported` (issue: `unrecognized_row`,
  severity `warning` — content existed but couldn't be placed at all), or
  `intentionally ignored with reason` (issue: `ambiguous_hierarchy` — a
  specific structural reason is known). `unaccountedRows` — the count left
  over after those three buckets — **must be 0** for a trusted import; if
  it's not, the exact unaccounted `SourceRef`s are included in the result,
  never just a number. A row that mapped its section/item/comment content
  successfully but also carries extra, unmodeled Spectora columns gets a
  separate `unsupported_metadata` issue instead — informational only, never
  counted against `unsupportedRows` (docs/decision-log.md D17).

Output is one of four honest, discrete statuses — `verified`,
`verified_with_warnings`, `review_required`, `failed` — never a blended
score. See `docs/decision-log.md` D9 for why a percentage/score was
deliberately rejected. `failed` means the *persistence round-trip itself*
is broken (structure/ordering/text mismatch — a bug in this system, not a
source limitation); `review_required` means a meaningful source row is
unaccounted for. Both set `reviewRequired: true`.

This engine's output — persisted to `import_runs.integrity_status` /
`integrity_result` — is the only source of truth for "did the import
preserve the customer's work." The AI auditor (§7) may explain this output;
it does not recompute or override it.

### 2.9 Template editor / import report
- **Editor**: reads/writes the canonical model via server actions/route
  handlers. Supports editing section names, item names, and comment text
  (requirement 4). Edits are persisted immediately to Supabase (requirement 5).
- **Import report**: a reviewer-facing screen built directly from the
  integrity engine's `IntegrityResult` — `src/lib/integrity/format-report.ts`
  is the reference rendering (structure counts, source coverage, ordering,
  text preservation, links, formatting warnings, and a prominent "review
  required" banner when applicable).
- **Duplicate**: one call to the `duplicate_template(uuid, text)` Postgres
  function deep-copies a template's full row set (sections, items, comments)
  under new IDs, atomically — same one-function-body-is-one-transaction
  posture as `import_template` (§2.8, decision-log D7). `import_runs` and
  `import_issues` are deliberately *not* copied: a duplicate is not a fresh
  Spectora import, so it has no import run and no integrity status of its
  own. Provenance survives as `templates.parent_template_id` plus the
  per-row `source_sheet`/`source_row_number` values, which remain true.
  After the write commits, both templates are re-read and compared by
  `verifyDuplicateIndependence` — content must match, and the two id sets
  must be disjoint (requirement 6).

### 2.10 Optional AI auditor
A bonus layer, built only after the baseline above is complete and demonstrated.
See §7 for its contract and hard constraints.

## 3. Data Model (as implemented)

`supabase/migrations/20260915000000_import_pipeline.sql` and
`20260915010000_import_integrity.sql`:

```
templates      (id, name, source_filename, source_file_sha256, created_at, parent_template_id?)
sections       (id, template_id, name, order_index, source_sheet, source_row_number)
items          (id, section_id, name, order_index, source_sheet, source_row_number)
comments       (id, item_id, plain_text, safe_html?, order_index,
                 source_sheet, source_row_number, link_metadata?)
import_runs    (id, template_id?, source_filename, source_file_sha256, status,
                 section_count, item_count, comment_count, issue_count,
                 integrity_status?, integrity_result JSONB?, error_message?,
                 created_at, completed_at?)
import_issues  (id, import_run_id, category, severity, source_sheet,
                 source_row_number, explanation, raw_snippet, imported_preview?,
                 resolution_status, fix_safely_available, proposed_plain_text?,
                 proposed_safe_html?, applied_fix_at?)
normalization_events (id, import_run_id, event_type, source_sheet,
                 source_row_number, description, before_hash, after_hash, created_at)
```

Two design choices worth calling out, since they differ from this section's
original sketch:

- **Source-row traceability lives inline**, not in a separate join table.
  `source_sheet`/`source_row_number` on `sections`/`items`/`comments` mean
  every persisted node can answer "where did this come from" from its own
  columns — no `skipped_rows` table needed; `import_issues` already plays
  that role for the rows that *didn't* map cleanly, and is a concrete,
  queryable home for requirements 3, 9, 11, and 12.
- **`import_runs.integrity_result` is the full computed `IntegrityResult`**
  (§2.8a), stored as JSONB, not a normalized breakdown across tables. The
  integrity engine's output is a cohesive, versioned report; splitting it
  across tables would make "read back exactly what the engine said" harder
  for no real benefit at this scale. `integrity_status` is a plain column
  alongside it purely so it's cheaply queryable/filterable without parsing
  JSON.

## 4. Why a Structured Model, Not an HTML Blob

Storing the imported template as one big HTML/rendered document would satisfy
"looks right when you view it" but would fail requirement 7 directly, and would
make requirements 4 (targeted editing), 6 (independent duplication), and 11
(preservation verification) far harder to implement correctly and prove. A
relational structure with stable IDs and order indices is what makes editing,
diffing, and reporting all straightforward and testable.

## 5. Formatting, Links, and Rich Content Policy

This is written up front so it can be pointed to by both `NOTES.md` and the
in-app import report, and so the sanitizer allowlist has a documented rationale
rather than being an arbitrary set of tags.

- **Plain text**: always preserved verbatim (after whitespace normalization).
- **Basic inline formatting** (bold, italic, line breaks): sanitized and kept as
  rich text, since inspection comments commonly rely on these for emphasis.
- **Links** (`<a href>`): kept, with `href` validated (http/https only) and
  `rel="noopener noreferrer"` enforced on render; a malformed or unsafe href is
  treated as unsupported content on that field, not silently dropped from the
  surrounding text.
- **Lists** (`<ul>/<ol>/<li>`): kept as rich text where structurally simple;
  deeply nested or malformed list markup is flagged unsupported.
- **Anything else** (inline styles, embedded images/scripts, tables, unknown
  tags): stripped by the sanitizer allowlist and explicitly recorded as
  unsupported formatting on that field — the surrounding plain text is still
  preserved, only the disallowed markup is flagged.
- The exact allowlist lives in code (sanitizer config) once implemented, and is
  referenced from here rather than duplicated.

## 5a. Safe Normalization, Recoverable Content, and Manual Review

Introduced after §5 shipped, to fix a real problem it had: every tag outside
the sanitizer allowlist — a genuinely harmless `<div>` wrapper with no
attributes, exactly as much as a stripped `<table>` — raised the identical
`unsupported_formatting` warning. That taught reviewers to ignore the
category, which is the opposite of what a warning is for. Three levels now
exist, applied in this order:

- **Level A — silent safe normalization.** Applied automatically, never
  shown as a warning: leading/trailing/duplicate whitespace, empty HTML
  tags, standard entity decoding (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`,
  `&quot;`), a bare `<div>`/`<span>` wrapper with **no attributes** (removing
  it loses nothing — no text, no attribute, no semantic hook), and
  `b`→`strong`/`i`→`em` formatting normalization. Every one of these is
  provably meaning-preserving by construction, not by inspection, so none of
  them is a judgment call. Each detected transform is still logged as a
  typed `NormalizationEvent` (`src/lib/import/types.ts`;
  `normalization_events` table) — "silent" means "not a customer-facing
  warning," never "untraceable." The Import Report shows a small, collapsed,
  non-alarming "Automatic cleanup" line when any occurred.
- **Level B — recoverable ("Fix Safely").** The same wrapper tags, but
  carrying an attribute (`class`, `style`, `id`, `data-*`) — a signal the
  wrapper *might* carry meaning this importer can't interpret, even though
  the mechanical unwrap is identical to Level A and still provably preserves
  every word (checked once, at import time, by comparing the fully-stripped
  plain text against what the transform would produce). Because the
  attribute is present, the fix is computed and stored
  (`import_issues.proposed_plain_text`/`proposed_safe_html`,
  `fix_safely_available`) but never applied automatically. A reviewer sees a
  "Fix Safely" action on the Issue Review page, which opens a before/after
  preview and applies the change only on explicit confirmation
  (`apply_issue_fix(uuid)`, one Postgres function call — the comment update
  and the issue's resolution commit together or not at all, same posture as
  `import_template`/`duplicate_template`, D7). If a field mixes an
  attribute-bearing wrapper with any genuinely unsupported tag (a `<table>`
  inside a `<div>`, say), the whole field falls through to Level C instead —
  a recoverable fix is only ever offered when it is the field's *only*
  problem.
- **Level C — manual review (unchanged).** Everything else outside the
  allowlist: tables, images, embeds, scripts, unknown tags. No deterministic
  proof of safe recoverability exists for these, so no fix is ever offered —
  this is exactly the pre-existing `unsupported_formatting` behavior from
  §5. `sanitized_unsafe_html` (script/iframe/object/embed/event-handler
  patterns) remains a distinct presentation category within this level for
  the same reason it always was: a routine formatting loss and a
  security-relevant removal are different facts and stay visually distinct.

The one product principle this all follows: **auto-fix when equivalence is
proven, ask the user when only a safe transformation can be proposed, never
guess when meaning or structure is uncertain.** No AI is involved anywhere
in this — every level above is a plain, deterministic, unit-tested function
(`src/lib/import/rich-content.ts`).

## 6. Failure Handling Philosophy

Per-row/per-field failures during parsing or normalization do not abort the
whole import. A single malformed cell becomes one `ImportIssueCandidate` (and,
once persisted, one `import_issues` row) with a reason code; the rest of the
template still imports. A file-level failure (e.g. not a valid spreadsheet, or
a required top-level structure entirely absent) does abort the import, with a
clear, honest error — never a partially-persisted template (see §2.8,
atomicity). At the persistence layer, every attempt — including early
failures — is still recorded as a `failed` `import_runs` row with the real
error (`docs/decision-log.md` D8), so a failure is demonstrable, not silent.
Requirement 12 (demonstrate at least one failure case) is satisfied by a
fixture and tests exercising both of these paths, end to end.

## 7. AI Auditor — Contract and Constraints

Built last, and only after every requirement above is demonstrably working
without it. Architecturally, it is a read-only consumer sitting after
persistence and the integrity engine, not a participant in the import pipeline:

```
deterministic integrity engine output (already computed, already persisted)
  → AI auditor (read-only) → plain-language explanation surfaced in the UI
```

Hard constraints (mirrored in `ENGINEERING.md` §4):
- Does not parse the source spreadsheet.
- Does not invent sections, items, or content.
- Does not change any imported/persisted content.
- Does not compute counts or determine preservation success/failure — it reads
  the integrity engine's already-computed results and explains them.
- Has no write path to template tables.
- Can fail, time out, or be disabled without affecting import, edit,
  duplication, or persistence in any way (enforced by keeping it behind its own
  route/component boundary with its own error handling, not inline in the core
  pipeline).
