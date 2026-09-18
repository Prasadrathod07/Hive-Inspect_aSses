# Notes

Written last, as the constitution for this project (`ENGINEERING.md`) required —
after the deterministic baseline, the AI layer, the reliability pass, and
the deployment prep were all done and tested, not before. This is the honest
account of what I prioritized, what I cut, what I'm not sure about, and how
I actually checked my own work — not a polished summary written to sound
finished.

I built this using Claude Code as my development tool, under my own
direction, phase by phase. That process is disclosed in full in
`docs/ai-development-workflow.md` — I'm not going to re-explain it here, but
I want to be upfront that it's part of how this got built, and that using it
didn't mean skipping the parts of engineering judgment that actually matter:
deciding what correctness means for this problem, deciding what to cut, and
checking that the result is actually true rather than just plausible.

## What I prioritized

Faithful import and provable trust came before feature breadth, on purpose.
The brief was explicit about why: the template an inspection company is
migrating represents years of real field use, and **they will not manually
recreate it.** A tool that imports 95% of a template correctly and silently
drops the other 5% is worse than useless — it's actively dangerous, because
nobody notices a missing paragraph until it matters on a real job, months
later, when there's no way to know what else might be missing too.

So the order of work was: parser correctness and ordering first, then a
structured data model (never an HTML blob), then an atomic write that can't
leave a half-imported template behind, then a **deterministic** integrity
engine that re-reads what Postgres actually has and reconciles it against
what was parsed — before any editing UI, before duplication, before AI. Only
once "did the import preserve everything" was a checked, provable fact did I
build the features that assume it's true. If I'd built the editor first and
the integrity engine last, I'd have had no way to know whether bugs I found
while editing were pre-existing import problems or new ones — the ordering
wasn't just discipline for its own sake, it made every later phase easier to
debug.

The Import Integrity Engine is deliberately the most-invested-in piece of
this codebase. It's also the one piece I'd point to first if asked "what
makes this different from a script that just copies rows over."

## What I cut and why

All deliberate, all out of scope for what this assessment asked for:

- **Inspection report writing.** This tool migrates a *template* —
  structure and boilerplate language. Writing an actual inspection report
  from a template is a materially different product with its own workflow
  (photos, findings, client-facing PDF generation) that wasn't asked for and
  would have diluted the actual differentiator.
- **Scheduling.** Out of scope entirely; no inspection-scheduling concept
  exists anywhere in this data model.
- **Payments.** Same — no billing/payment surface anywhere in this app.
- **Homeowner portal.** This is squarely a Forward-Deployed-Engineer /
  inspector-facing tool. A homeowner-facing view is a different product
  with different trust and privacy requirements.
- **Mobile app.** Explicitly out of scope per the brief ("no mobile app is
  required"); the web UI is deliberately desktop-first but verified not to
  break at 13"-laptop width and narrower.
- **Full Spectora parity.** This imports one specific export shape ("Export
  to spreadsheet → Export HTML Text") faithfully. It does not attempt to
  replicate Spectora's own editor, its scheduling, its report delivery, or
  any other Spectora feature. Parity with Spectora-the-product was never the
  goal — faithful migration of the template *data* was.
- **AI-based primary mapping.** The parser that decides what a row means is
  100% deterministic, with zero model calls anywhere in the import path.
  This was a hard constraint I held throughout, not just an initial choice:
  every time it would have been faster to let an LLM guess at ambiguous
  structure, I wrote a deterministic rule and a test for it instead. AI only
  appears after the deterministic result already exists, as an optional
  explanatory layer that cannot see raw source content and cannot write to
  template data — see `docs/ai-auditor.md`.

## Supported input

Precisely: Spectora's "Export to spreadsheet → Export HTML Text" option,
`.xlsx` or `.xls`, up to 4MB. Within that:

- One or more sheets — every sheet in the workbook is parsed, not just the
  first one with a recognizable header.
- A header row (not necessarily row 1) identifying section, item, and
  comment columns by keyword — see the full keyword list in
  `docs/spectora-format.md`.
- Section/item hierarchy expressed on the same row as the comment, either
  blank-filled or repeated on every row.
- Comment cells containing literal HTML as their string value: bold,
  italic, underline, paragraphs, line breaks, lists, and `http(s)` links are
  preserved as rich text. Anything else in the markup is stripped and
  reported, never silently kept or silently dropped.

What it does **not** claim to support: images, tables, embedded video/audio,
multi-level nested lists, or any comment markup outside that allowlist —
these are recorded as unsupported content with the raw source retained, not
approximated or guessed at.

## Known limitations

Stated plainly, because hiding these would defeat the entire point of a
project built around "prove it, don't just claim it":

1. **No real Spectora export has ever been parsed by this system.** Every
   rule about the format's structure is a documented assumption
   (`docs/spectora-format.md`), verified only against a hand-built synthetic
   fixture that mimics what I believe the format looks like. This is the
   single largest limitation of this whole submission, and no amount of
   synthetic testing closes it. If the real format differs from these
   assumptions — different header vocabulary, a nested structure instead of
   a flattened one, richer HTML than the allowlist anticipates — the parser
   will need real adjustment, not just more tests against fixtures I wrote
   myself.
2. **The live database path has never actually been exercised.** Two
   integration test files and most of the Playwright browser suite are
   written and correct by inspection, but skip-gated behind a live Supabase
   connection this development environment couldn't reach. Atomicity, the
   Postgres functions, and the post-commit re-read are verified by
   construction and code review, not by observation.
3. **The 4MB upload limit is set by Vercel's platform, not by real-world
   measurement.** I've never measured how large an actual Spectora export
   gets. If a real file exceeds 4MB, the fix is a genuine architecture
   change (direct-to-storage upload), not a constant — see
   `docs/decision-log.md` D15.
4. **The AI Auditor has never been called against a real provider.** Its
   entire test suite runs through a mocked provider. Whether a real model
   reliably follows the JSON-only response contract in practice is
   unverified.
5. **No load or concurrency testing.** Two people editing the same template
   at once, or a genuinely large export, are both untested.
6. **No visual regression testing.** A layout break wouldn't be caught
   automatically.
7. **The seeding script (`npm run seed`) has never succeeded against a live
   database.** Its own logic is unit-tested against a mocked client, and it
   was manually run to confirm it fails honestly in the states it's
   actually in — no real export, no service-role key — but it has never
   actually written a real seeded template, so the real reviewer
   first-open experience has never been directly observed.

Full, itemized list with more detail per point: `docs/testing.md`
"Coverage gaps."

## Formatting / links / rich content — exact behavior

- **Plain text**: always preserved verbatim, after whitespace normalization
  only (so `\n` vs. a literal space, or trailing whitespace, don't count as
  a mismatch — but any actual character difference does).
- **Bold, italic, underline, paragraphs, line breaks, lists**: kept as rich
  text, sanitized through an explicit allowlist
  (`b, strong, i, em, u, br, p, ul, ol, li, a`); `b`/`i` are normalized to
  `strong`/`em` on the way in, so a stored comment and one typed fresh in the
  editor (whose Tiptap toolbar already emits `strong`/`em`) never diverge.
- **Links**: `href` restricted to `http`/`https`. A safe link's href and
  visible text both survive untouched. An unsafe-scheme link (tested with
  `javascript:`) has only its href removed — it stops being clickable and
  gets flagged — but its visible text is still customer-authored content
  and stays in the plain text.
- **Everything outside the allowlist** — `<script>`, `<img>`, `<table>`,
  embeds, inline styles, unknown tags — is stripped from the saved HTML and
  explicitly reported as unsupported formatting, naming the exact tag(s)
  removed. The surrounding sentence is never lost, only the markup itself.
- Tag-stripping is boundary-aware: removing a `<br>` or closing a `<li>`
  becomes whitespace before the tag disappears, so adjacent words don't get
  jammed together ("noted;recommend" would be a bug; "noted; recommend" is
  correct).
- The **exact same** sanitizer rules apply to edits made in the UI after
  import, not just to the original import — the rich-text toolbar only ever
  offers formatting the server will actually keep.

### Three-tier handling of unsupported markup (docs/architecture.md §5a)

Not every disallowed tag deserves the customer's attention, and conflating
"harmless noise" with "content that might have lost meaning" was itself a
real problem this project had before this pass — every `<div>`/`<span>`
wrapper, no matter how empty, used to raise the exact same
`unsupported_formatting` warning as a stripped `<table>` or `<script>`. Now:

- **Silent safe normalization** (never a warning): a bare `<div>`/`<span>`
  wrapper with no attributes, leading/trailing/duplicate whitespace, empty
  tags, standard HTML entities (`&nbsp;`, `&amp;`, …), and the `b`→`strong`/
  `i`→`em` rewrite above. Nothing here can change wording, so nothing here
  is shown as a warning — but it's still logged internally as a typed
  `NormalizationEvent` (`normalization_events` table, one row per detected
  transform), so "silent" never means "untraceable." The Import Report shows
  a small, collapsed "Automatic cleanup — N harmless formatting differences
  were normalized" line when any occurred, never a warning-colored one.
- **Recoverable ("Fix Safely")**: the same wrapper tags, but carrying an
  attribute (`class`, `style`, `id`, …) we can't prove is purely cosmetic.
  The unwrap is mechanically identical and still provably preserves every
  word — proven by exact comparison at import time, not asserted — but it's
  held for a human to confirm rather than applied automatically. The Issue
  Review page shows a "Fix safely" button that opens a before/after preview
  before anything changes; applying it calls one atomic Postgres function
  (`apply_issue_fix`, same one-function-body-is-one-transaction pattern as
  `import_template`) that updates the comment and marks the issue resolved
  together or not at all.
- **Manual review** (unchanged from before this pass): tables, images,
  embeds, scripts, and any other tag outside the allowlist. No proof of safe
  recoverability exists for these, so no fix is ever offered — they stay
  exactly the "present in source, unsupported by this importer" case
  described below.

## Missing from source vs. unsupported by this importer

This distinction is treated as a hard rule throughout, because collapsing
it would mean this tool could accidentally claim a customer's own content
never existed:

- **"Not present in source"** means: I checked, and there is genuinely no
  evidence in the parsed rows that this content ever existed. An item with a
  blank comment cell gets zero comments and — importantly — **no issue is
  raised**, because a blank cell isn't a failure, it's just absent data.
- **"Present in source, unsupported by this importer"** means: the content
  exists — I can point to the exact row, and the raw text is retained in
  full — but this importer couldn't map it cleanly (a disallowed tag, an
  unrecognized column, an ambiguous hierarchy position). This is always
  surfaced as an issue with the retained raw source attached, never phrased
  as if the content were simply gone.

The UI states this distinction explicitly rather than leaving it implicit —
the Issue Review page's own copy says "present in source but unsupported by
this importer," never the weaker and misleading "not present." The
mechanism that keeps this honest: the hierarchy lookup that attaches an
issue to a section/item only ever claims a match on an **exact** source-row
number — never inferred from a neighboring row, which is exactly the kind
of inference that could turn "unsupported" into a false "not present."

## How I checked my work

- **Parser tests** (`src/lib/import/*.test.ts`, 81 cases): hierarchy,
  ordering, HTML sanitization, link handling, unknown/unmapped rows, unsafe
  content, malformed files — including a byte-for-byte golden-JSON
  comparison so silent drift in parser behavior gets caught even when no
  individual assertion would have noticed.
- **Format generalization checks** (`parser-generality.test.ts`, 20 cases):
  the parser is exercised against eight different header wordings, columns
  in arbitrary order, a header not on row 1, multi-sheet workbooks, and
  structurally different shapes — specifically to catch the failure mode of
  a parser that quietly only works on the one file I built it against. This
  caught two real bugs during development: the parser used to silently drop
  every sheet after the first one in a multi-sheet workbook (with zero
  issues raised — the worst possible failure, since it also defeated the
  check meant to catch silent drops), and a header like "Item Text" could be
  claimed by two column roles at once, duplicating every item name into a
  comment. Both fixed and now pinned by regression tests.
- **Integrity checks** (`compute-integrity.test.ts`, 29 cases): every
  category the engine reports is tested in both directions — not just "a
  clean import reports verified," but "a corrupted persisted value is
  actually detected as a mismatch," for replaced text, truncated text,
  emptied text, an altered name, and a punctuation-only change.
- **Source-row coverage**: asserted that mapped + unsupported + ignored +
  unaccounted always sums to the total meaningful row count — there is no
  fifth silent bucket a row could disappear into.
- **Edit persistence**: Server Actions for section/item name and comment
  edits are tested for validation, sanitization, and — critically — for
  what happens when the save itself fails (the edit must stay on screen,
  never get silently discarded). Autosave/debounce browser behavior was
  additionally verified in an interactive Playwright session against mock
  data during development (not part of the committed suite, since it needed
  a live database) — that session caught two real bugs: a save-status
  indicator that could silently desync from the actual field state, and a
  Server Action whose thrown error left the UI stuck on "Saving…" forever
  instead of showing "Save failed."
- **Independent duplicate test**: independence isn't asserted, it's proven —
  after a real duplicate operation, both templates are re-read and checked
  for matching content *and* completely disjoint row-id sets, since every
  write in this app is keyed by row id. A test simulates editing one
  tree via an id-keyed update and confirms it structurally cannot reach the
  other.
- **Second-input / generalization checks**: no fixture beyond the one
  synthetic file and the in-test edge-case workbooks has ever been run
  through this parser — see "Known limitations" above. The generalization
  checks test *shape* variation (header wording, column order, sheet count),
  not a second real-world file, because no second real file exists.

Full breakdown of what's automated vs. manually checked vs. not yet
verified at all: `docs/testing.md`.

## AI decision

The product has a deterministic core and, separately, an optional AI
explanation layer — never AI in the decision-making path. Every number,
status, and pass/fail judgment in this app comes from
`computeIntegrityResult`, a pure function with zero model calls. The AI
Auditor sits strictly downstream of that already-computed, already-persisted
result: it explains it in plain language for a non-technical reader, and its
output schema has no field through which it could restate a count, override
a status, or claim to have found something the deterministic engine didn't.
It can't see the customer's actual template content, its recommendations are
checked against a real issue-ID allowlist (an invented ID rejects the whole
response), and it has no write path to any template table. If it's disabled,
times out, or returns garbage, the result is one honest sentence under an
already-complete report — never a blocked import, never a broken page. Full
design: `docs/ai-auditor.md`; the reasoning behind each specific constraint:
`docs/decision-log.md` D13.

## Time spent

Approximate time spent: **~16–18 hours across two focused days.** This
included product exploration of Hive Inspect and Spectora, architecture and
data-model decisions, implementation of the importer/editor/persistence
workflow, Import Integrity and safe-normalization features, AI Import
Auditor integration, testing, UI/UX refinement, deployment preparation, and
documentation.

| Phase | Hours |
|---|---|
| Product exploration & requirements | ~2 |
| Architecture & data model | ~2 |
| Core implementation (importer, editor, persistence) | ~7–8 |
| Import Integrity / edge cases / AI | ~2–3 |
| Testing & UI polish | ~2 |
| Documentation & deployment prep | ~1 |
| **Total** | **~16–18** |

## Credits

- **Framework/libraries**: Next.js, React, Tailwind CSS, shadcn/ui (Nova
  preset), Zod, `@supabase/supabase-js`, SheetJS (`xlsx` — installed from
  SheetJS's own patched CDN build, not the npm registry version, which has
  unfixed vulnerabilities), `sanitize-html`, Tiptap, `sonner`, Lucide icons,
  Vitest, Playwright. Exact versions: `package.json`.
- **AI provider**: Anthropic's Messages API, called directly via `fetch` —
  no SDK dependency.
- **Development tool**: Claude Code (Anthropic), used throughout under my
  own direction — full disclosure of the process in
  `docs/ai-development-workflow.md`.
- **No external tutorial, template, or code snippet was copied into this
  codebase.** The application code is original to this project. shadcn/ui's
  primitives (`src/components/ui/`) are the standard shadcn scaffolding, used
  as intended — not third-party code I'm otherwise claiming as my own.

## Product exploration

**`<!-- TODO: these sections need my own real, first-hand observations — none of the following has actually been researched from within this project, and I'm not going to fabricate product opinions. -->`**

### Hive observations

`<!-- TODO: my own notes on Hive's actual product, positioning, or what I inferred about their engineering priorities from the assessment brief itself. Nothing in this repository reflects real research into Hive's live product — fill in before submission if this section is expected to have content. -->`

### Spectora observations

`<!-- TODO: my own notes on Spectora's actual product, based on real use or research — not the parser's documented *assumptions* about its export format (those are in docs/spectora-format.md and are guesses, not observations). If I have actually used Spectora, this is where that firsthand knowledge belongs. -->`

### Binsr comparison

`<!-- TODO: only fill this in if I actually explored Binsr as part of this assessment. If I didn't, it's fine to state that plainly and remove this section rather than force a comparison that isn't grounded in real use. -->`
