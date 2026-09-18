# Spectora Export Format

## Status: no real export in this repository

A search of this repository (`sample-data/spectora/` and the rest of the
tree) found **zero** real Spectora export files. This is recorded as a
final-submission blocker in
[`docs/requirements-matrix.md`](requirements-matrix.md) (row 16) and in
[`sample-data/spectora/README.md`](../sample-data/spectora/README.md).

Because of that, **this document contains no claims about what a real
Spectora "Export to spreadsheet → Export HTML Text" file actually
contains.** Everything below is one of two things, and every section says
which:

- **ASSUMPTIONS / GENERALIZATION RULES** — informed guesses about the
  format, based on how flattened report-spreadsheet exports typically work
  and on the literal name of the export option ("Export HTML Text" implies
  comment cells contain raw HTML markup as their string value, not stripped
  plain text). These are unverified and must be checked against a real file
  before they're trusted.
- **SYNTHETIC FIXTURE STRUCTURE** — a factual description of
  `tests/fixtures/synthetic-spectora-like.xlsx`, a file we built by hand.
  This is real, inspectable data, but it is **not** Spectora data — it only
  describes what we made up for engineering scaffolding.

There is no "OBSERVED IN OUR SAMPLE" section with real content in it. That
section will be added — and this whole document revised — the moment a real
export is provided. Until then, treat every structural rule the parser
enforces as provisional.

## ASSUMPTIONS / GENERALIZATION RULES

These are the assumptions the parser (`src/lib/import/`) is built against.
Each one is called out in code comments at the point it's used, linking
back here.

1. **Flattened, row-per-comment layout.** We assume the export is a single
   sheet with one row per narrative/comment line, and that hierarchy
   (section → item) is expressed through columns on that same row rather
   than through separate sheets or a nested/outline structure. This is the
   most common shape for "export to spreadsheet" features in report tools,
   but we have not seen Spectora's actual layout.

2. **Column roles identified by header keyword, not position.** We assume
   there is a header row (not necessarily row 1 — there may be a title/notes
   row above it) containing recognizable words: something containing
   "section", "area", or "category"; something containing "item" or
   "component"; something containing "comment", "narrative", "limitation",
   "finding", "description", "text", "deficiency", or "observation". Header
   text is normalized before matching — punctuation like `(HTML)`, `:`, or
   `/` is stripped so "Comment (HTML)" and "Comment" match identically (see
   `normalizeHeaderCell` in `src/lib/import/extract-rows.ts`). The parser
   scans the first 15 rows of each sheet looking for a row where at least
   two of these three roles are identifiable, and does not assume fixed
   column indices (requirement 10). The exact keyword list is a guess and
   will need real header text to validate — `src/lib/import/parse-workbook.test.ts`
   includes a case with entirely different header wording ("Area" /
   "Component" / "Finding") and a different section count than the
   synthetic fixture, specifically to prove the parser isn't quietly
   tied to one vocabulary or one template shape.

3. **Blank-fill OR repeat-every-row hierarchy grouping.** We assume that
   when a comment's section/item hasn't changed from the previous row, the
   export either leaves those cells blank (common in "grouped" exports) or
   repeats the same value on every row. The hierarchy builder
   (`src/lib/import/hierarchy.ts`) treats a non-blank value that differs
   from the current group as a new section/item, and a blank value as "same
   group as before" — this is deliberately written to tolerate both
   conventions, since we don't know which one Spectora uses.

4. **"Export HTML Text" means literal HTML markup in the comment cell's
   string value.** Not Excel rich-text runs, not a separate plain-text
   column alongside a "has formatting" flag — the assumption is that the
   cell value itself is a string like `"<p>Shingles are in <b>good</b>
   condition.</p>"`. This is the whole reason a sanitizer stage
   (`src/lib/import/rich-content.ts`) exists in the pipeline at all; if this
   assumption is wrong, that stage may need to change but the surrounding
   architecture (structured model, issue tracking) should not.

5. **No explicit "template name" cell.** A flattened row-per-comment export
   has no obvious place for a template-level name. We assume the template
   name has to be derived — preferring a non-generic sheet name (i.e. not
   literally "Sheet1"), falling back to the uploaded filename, and falling
   back further to a literal "Untitled Template" if neither is usable. This
   is recorded per-import via `sourceMetadata.templateNameSource` on the
   canonical model, specifically so this guess is never silently presented
   as if it were data from the source file.

6. **Blank rows are pure spacers, not content.** A row where every mapped
   column *and* every unmapped column is empty is assumed to carry no
   information and is skipped without generating an issue. Any row with
   content anywhere — mapped or not — is never silently skipped
   (requirement 3); see `src/lib/import/normalize.ts`.

7. **Links, if present, are fully-qualified `http(s)://` URLs.** Inspection
   comments referencing outside resources (manufacturer spec sheets, code
   references) are assumed to use absolute links, not relative/app-internal
   ones. A link with any other scheme (or a missing scheme) is treated as
   unsupported — see the formatting/links policy in
   [`docs/architecture.md` §5](architecture.md#5-formatting-links-and-rich-content-policy).

## What we deliberately do NOT hard-code (requirement 10)

- **Row numbers.** The header row is detected by scanning, not assumed to
  be row 1; data rows are addressed relative to wherever the header was
  found.
- **The template name.** There is no code path that reads a specific cell
  and assumes it's "the" template name; see assumption 5 above.
- **The number of sections.** The hierarchy builder has no upper or lower
  bound on section/item/comment counts — it reacts to whatever rows exist.
- **One fixed filename.** `parseSpectoraWorkbook` takes the filename as an
  input parameter used only for the name-derivation fallback and in issue
  messages — it never checks the filename against a specific expected
  value, and the pipeline runs identically regardless of what the file is
  called.

## Parser implementation (this phase)

The full deterministic pipeline now exists in `src/lib/import/` — no LLM
anywhere in it, by design (see `docs/decision-log.md` D3 and `ENGINEERING.md` §4).
Stage-by-stage:

`validate-file.ts` → `workbook.ts` → `extract-rows.ts` → `normalize.ts` →
`hierarchy.ts` (calls into `rich-content.ts` per comment) → `validate.ts`,
orchestrated by `parse-workbook.ts`.

**File validation** (`validate-file.ts`, new this phase — this is
architecture.md §2.1, which previously only existed implicitly inside the
workbook-load try/catch): rejects an empty file, a file over
`MAX_FILE_SIZE_BYTES` (4MB — set by the deployment platform's request body
limit, not by an assumption about spreadsheet size; see
`docs/deployment.md`), or a filename without a `.xlsx`/`.xls` extension —
all as clear, specific blocking issues before any parsing is attempted, so
a bad upload gets an honest reason instead of a generic parser stack trace.

**Rich content policy, as implemented** (`rich-content.ts`): allowlist is
`b`, `strong`, `i`, `em`, `u`, `br`, `p`, `ul`, `ol`, `li`, `a` — paragraphs,
line breaks, bold/italic/underline, lists, and links, matching
`docs/architecture.md` §5. `b`/`i` are accepted as input but normalized to
`strong`/`em` on output, so a stored comment always matches what the editor's
own Tiptap toolbar would produce. Anything else — `<script>`, `<img>`,
`<table>`, `<iframe>`/video embeds, inline styles, unknown tags — is stripped
from `safeHtml` and reported via an `unsupported_formatting` issue that names
the exact tag(s) removed; the surrounding text is never lost. This directly
covers the "image/video/embed/table content that cannot be faithfully
represented" case: it's recorded as unsupported, never silently dropped or
presented as if it had succeeded.

One exception exists within "anything else": a `<div>`/`<span>` wrapper is
either normalized silently (no attributes — nothing is lost by unwrapping
it) or offered as a "Fix Safely" action with a before/after preview (an
attribute is present, so the unwrap is still provably text-preserving but
held for a reviewer's confirmation rather than applied automatically). See
`docs/architecture.md` §5a and `docs/decision-log.md` D16 for the full
three-level policy this section's Row 7 (`<script>`) and any table/image/
embed case still fall outside of — those remain manual-review-only, exactly
as before.

**Links**: a safe `http(s)://` link's href and visible text both survive
untouched into `safeHtml`/`linkMetadata`. An unsafe-scheme link (tested with
`javascript:`) is *unwrapped*, not deleted — the href/click-ability is
removed and flagged (`unsupported_link`), but the link's own visible text is
still customer-authored content and is kept in `plainText`. A second,
independent check (`hadChangedLink`) compares each surviving link's href
against its pre-sanitization source value (decoding routine HTML-entity
encoding first, so a `&` in a query string doesn't false-positive) and
raises a `warning`-level `unsupported_link` issue if a link's URL came out
different from the source. Under the current allowlist config no stage
actually rewrites a safe href, so this should never fire in practice today —
it exists as a tested safety net for "detect removed/changed links," not
just removed ones.

**Plain-text fidelity**: stripping tags naively can jam adjacent words
together across a removed `<br>`/`<li>`/`<p>` boundary (e.g. "noted;recommend"
instead of "noted; recommend"). `stripToPlainText` treats those boundaries as
whitespace before stripping, then collapses runs of whitespace to one space
— matching the documented policy that plain text is preserved "verbatim
(after whitespace normalization)," not verbatim-including-accidental-garbling.

**Determinism, all the way down**: `buildHierarchy` (and
`parseSpectoraWorkbook`) accept an optional `generateId` function, defaulting
to `crypto.randomUUID`. Given the same bytes, filename, `importedAt`, and
`generateId`, the parser produces byte-identical output — verified by a
golden-JSON test (see below) and by `createSequentialIdGenerator` in
`id-generator.ts`, used for both. `checksum.ts` adds `sha256Hex` and a
whitespace-normalized `textsMatch` — deterministic text-comparison primitives
a future integrity engine (or this phase's own tests) can use to verify
preservation without relying on loose string equality.

**Golden canonical JSON**: `tests/fixtures/synthetic-spectora-like.expected.json`
is the parser's own output for the synthetic fixture, generated by
`scripts/generate-golden-fixture.ts` with a deterministic ID generator and a
fixed timestamp — never hand-typed. `parse-workbook.test.ts` re-runs the
parser with the same deterministic inputs and deep-equals the result against
this file. A future intentional behavior change means regenerating this file
and reviewing the diff, which is the point.

## SYNTHETIC FIXTURE STRUCTURE — `tests/fixtures/synthetic-spectora-like.xlsx`

This file is **not** a Spectora export. It's generated by
[`scripts/generate-synthetic-fixture.ts`](../scripts/generate-synthetic-fixture.ts)
(`npx tsx scripts/generate-synthetic-fixture.ts`) purely so the pipeline has
something concrete to run against while assumption 1–7 above remain
unverified. Full disclaimer and regeneration instructions live in
[`tests/fixtures/README.md`](../tests/fixtures/README.md).

Structure, as built (one sheet, `"Sheet1"` — a deliberately generic name, to
exercise the filename-fallback naming path from assumption 5):

| Row | Section | Item | Comment (HTML) | Photos |
|---|---|---|---|---|
| 1 | `SYNTHETIC TEST FIXTURE — NOT A REAL SPECTORA EXPORT` (preamble row, no header keywords) |
| 2 | **Section** | **Item** | **Comment (HTML)** | **Photos** *(header row — detected at index 1)* |
| 3 | Roof | Shingles | `<p>...<b>good</b>...</p>` | |
| 4 | | Gutters | `...<i>debris</i>...<br>...<a href="https://example.com/gutter-guide">...</a>` | |
| 5 | | *(blank)* | `Additional note: <ul><li>...</li>...</ul>` | |
| 6 | | | | *(fully blank spacer row)* |
| 7 | Plumbing | Water Heater | `...<script>alert(...)</script>...` | |
| 8 | | Water Heater | `...<a href="javascript:alert(1)">click here</a>` | |
| 9 | | Fixtures | *(blank)* | `3` |
| 10 | Electrical | *(blank)* | `<p>Panel is a mix of breaker types...</p>` | |
| 11 | | Panel | `<p>200A panel observed...</p>` | |

This was run through `scripts/inspect-workbook.ts` (the reusable inspector
below) as a sanity check; output (synthetic data, safe to show):

```
=== Workbook: tests/fixtures/synthetic-spectora-like.xlsx ===
Sheets: Sheet1

--- Sheet "Sheet1" ---
Row count: 11
Detected header row index: 1
Detected column roles: section=col0, item=col1, comment=col2
Data rows: 9
Blank/spacer rows: 1
Rows with content outside mapped columns: 1
Rows where comment contains HTML tags: 7
Links found: 2 (https://example.com/gutter-guide, javascript:alert(1))
Comment values over 300 chars: 0
Distinct section names seen: 3 (Roof, Plumbing, Electrical)
```

Deliberately exercised, row by row:

- **Row 3**: baseline case — plain text plus allowlisted `<b>` formatting.
- **Row 4**: a safe `https://` link, plus `<i>`/`<br>` formatting.
- **Row 5**: blank-filled section *and* item — tests that grouping still
  correctly attaches to "Gutters" under "Roof" via assumption 3, plus a
  `<ul>/<li>` list.
- **Row 6**: a fully blank row — must be skipped with **no** issue at all
  (assumption 6).
- **Row 7**: a `<script>` tag — outside the sanitizer allowlist. Must be
  stripped from `safeHtml`, the rest of the sentence preserved in
  `plainText`, and an `unsupported_formatting` issue raised.
- **Row 8**: a `javascript:` link — unsafe scheme. The link itself must be
  removed (not clickable in `safeHtml`), but its visible text ("click
  here") is still customer-authored content and is preserved in
  `plainText`; an `unsupported_link` issue is raised.
- **Row 9**: an item with no comment at all (legitimately absent in the
  source — not an issue) *and* a value in an unmapped "Photos" column
  (which *is* an issue — content outside the recognized columns, flagged
  rather than dropped).
- **Row 10**: a comment attached to a brand-new section before any item
  exists in it — genuinely ambiguous. Flagged as `ambiguous_hierarchy`
  rather than guessed at.
- **Row 11**: normal continuation, closing out the fixture on a clean case.

## The inspector tool

[`scripts/inspect-workbook.ts`](../scripts/inspect-workbook.ts) is the
reusable "programmatically inspect it" tool this task asked for. It is not
specific to the synthetic fixture — run it against any `.xlsx`/`.xls` file:

```
npx tsx scripts/inspect-workbook.ts <path-to-file>
```

It reports sheet names, a raw preview of the first rows, the detected
header row and column-role mapping, row/blank-row counts, whether comment
cells contain HTML tags, links found (with their raw hrefs — including
unsafe ones, deliberately, so they're visible for review), and how many
comment values exceed a length threshold. **This is the tool to run the
moment a real Spectora export is added to `sample-data/spectora/`** — its
output should replace the placeholder guesses in this document with an
actual "OBSERVED IN OUR SAMPLE" section.

It intentionally prints raw (truncated) cell text to stdout, so when run
against a real customer file, review the output yourself before pasting it
anywhere external — don't assume it's automatically safe to share just
because the tool is generic.

## Open questions to validate once a real export exists

- Is the layout really flattened/row-per-comment, or does Spectora export
  multiple sheets (e.g. one per section) or a nested/outline structure?
- What are the *actual* header names? Our keyword list (assumption 2) is a
  guess and may need new keywords, or may false-positive on an unrelated
  column.
- Does Spectora blank-fill repeated section/item values, repeat them on
  every row, or use some other convention entirely (e.g. merged cells,
  which SheetJS reports differently than repeated/blank values)?
- Is comment HTML simple (bold/italic/links/lists) or does it include
  richer constructs (tables, images, custom styling) that our allowlist
  doesn't anticipate?
- Is there in fact a template name anywhere in the export (a title row, a
  filename convention, a dedicated cell), making assumption 5's fallback
  chain unnecessary?
- Are there multiple narrative "types" per item (e.g. separate
  Info/Limitation/Deficiency rows) that carry meaning we're currently
  treating as an undifferentiated list of comments?

Every one of these, once answered, should turn into either a confirmed rule
in a real "OBSERVED IN OUR SAMPLE" section, or a corrected assumption —
never left as a silent guess baked into the parser without a paper trail.
