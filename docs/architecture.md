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
  → deterministic integrity engine
  → atomic persistence in Supabase
  → template editor / import report
  → optional AI auditor
```

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

### 2.8 Deterministic integrity engine
Computes, without any AI involvement:
- Row-count reconciliation: source rows in vs. rows accounted for out
  (mapped + skipped), per section and in total.
- A diff-style report of what was imported, what was preserved verbatim, what
  was normalized/changed (e.g. whitespace, HTML entity decoding), and what was
  marked unsupported.
- The explicit distinction required by requirement 9: `absent_in_source` (the
  field simply had no value in the export) vs. `unsupported_by_importer` (the
  export had content there, but our importer couldn't map it).
This engine's output is the only source of truth for "did the import preserve
the customer's work." The AI auditor (§7) explains this output; it does not
recompute or override it.

### 2.9 Atomic persistence in Supabase
The canonical model (post-validation) and its integrity report are written to
Postgres in a single transaction: either the whole template (all sections,
items, comments, and the associated import report) is persisted, or none of it
is. No partially-imported template should ever be visible/queryable.

### 2.10 Template editor / import report
- **Editor**: reads/writes the canonical model via server actions/route
  handlers. Supports editing section names, item names, and comment text
  (requirement 4). Edits are persisted immediately to Supabase (requirement 5).
- **Import report**: a reviewer-facing screen built directly from the integrity
  engine's output — counts, preserved/changed/unsupported breakdowns, and the
  absent-vs-unsupported distinction, per section and item.
- **Duplicate**: deep-copies a template's full row set (sections, items,
  comments, and — separately — a fresh import report if relevant) under new IDs,
  so edits to the copy never touch the original (requirement 6).

### 2.11 Optional AI auditor
A bonus layer, built only after the baseline above is complete and demonstrated.
See §7 for its contract and hard constraints.

## 3. Data Model (indicative)

Exact columns will be finalized during implementation, but the shape is fixed by
this architecture:

```
templates      (id, name, source_filename, created_at, duplicated_from_id?)
sections       (id, template_id, name, order_index)
items          (id, section_id, name, order_index)
comments       (id, item_id, plain_text, rich_text_html?, order_index)
import_reports (id, template_id, generated_at, totals JSON, per_section JSON)
skipped_rows   (id, template_id, source_location, reason_code, raw_snippet)
```

`skipped_rows` and `import_reports` exist specifically so requirements 3, 9, 11,
and 12 have a concrete, queryable home — they are not an afterthought bolted onto
the editor tables.

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

## 6. Failure Handling Philosophy

Per-row/per-field failures during parsing or normalization do not abort the
whole import. A single malformed cell becomes one `skipped_rows` entry with a
reason code; the rest of the template still imports. A file-level failure (e.g.
not a valid spreadsheet, or a required top-level structure entirely absent) does
abort the import, with a clear, honest error — never a partially-persisted
template (see §2.9, atomicity). Requirement 12 (demonstrate at least one failure
case) is satisfied by a fixture and test exercising both of these paths.

## 7. AI Auditor — Contract and Constraints

Built last, and only after every requirement above is demonstrably working
without it. Architecturally, it is a read-only consumer sitting after
persistence and the integrity engine, not a participant in the import pipeline:

```
deterministic integrity engine output (already computed, already persisted)
  → AI auditor (read-only) → plain-language explanation surfaced in the UI
```

Hard constraints (mirrored in `CLAUDE.md` §4):
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
