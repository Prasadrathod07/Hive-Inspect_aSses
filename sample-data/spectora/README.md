# Spectora Sample Export

`Residential Template-2026-09-15.xls` in this directory is the real Spectora
"Export to spreadsheet → Export HTML Text" export used for this assessment
submission (assessment requirements 15 and 16). It is committed unmodified —
same bytes, same filename as exported.

## Required disclosure

| Field | Value |
|---|---|
| **Template name** | Residential Template |
| **Spectora source** | A personal Spectora trial account created for this assessment |
| **Export method** | Spectora → *Export to spreadsheet* → *Export HTML Text* |
| **Contains real customer information?** | **No.** This is the template's own section/item/comment structure, not a completed inspection report — no client name, property address, or photo of a real property appears anywhere in the file. |

## Known parser findings from this file

Feeding this real export through the importer (`src/lib/import/`) found and
fixed two real defects that no synthetic fixture had ever exposed:

1. **Column-role detection picked the wrong column.** This export's header
   pairs a short `Comment Name` label per boilerplate entry (e.g.
   "Cracking - Major") with a separate `Comment Text` column holding the
   actual HTML narrative. The parser used to let the first bare match of
   "comment" win, so `Comment Name` was imported as if it were the
   customer's actual comment text, and the real narrative in `Comment Text`
   was never read at all. Fixed in `src/lib/import/extract-rows.ts` — a
   `*Name`-suffixed column no longer outranks a stronger narrative-content
   column (`text`/`narrative`/`description`/etc.) for the comment role. See
   `docs/decision-log.md`.
2. **A literal `&` in plain text came out as `&amp;`.** `sanitize-html`'s
   tag-stripping mode still HTML-escapes text content, so any comment
   containing a bare ampersand (e.g. "Flashing & trim") was silently
   corrupted on the way into `plain_text`. Fixed in
   `src/lib/import/rich-content.ts`.

Both are regression-tested (`src/lib/import/parser-generality.test.ts`,
`src/lib/import/rich-content.test.ts`).

## Synthetic fixtures

Structural development and testing (e.g. proving the parser isn't
hard-coded to a single file — requirement 10) also uses hand-built synthetic
`.xlsx` fixtures that mimic the Spectora HTML-text export structure. Any such
fixture:

- Lives under `tests/fixtures/` (engineering test fixtures) — never directly
  in `sample-data/spectora/`, which is reserved for the real export.
- Is named with a `synthetic-` prefix.
- Is referenced in code/tests and in `NOTES.md` explicitly as synthetic, never
  presented as "the" assessment sample.

`npm run seed -- --allow-synthetic` seeds the demo template from that
synthetic fixture, under a template name that says "SYNTHETIC DEMO" wherever
it's displayed in the app, purely so the demo mechanics (dashboard → report →
editor → duplicate) can be exercised locally. **It does not satisfy
requirements 15 or 16** — use `npm run seed` (no flags) against the real file
above for that.
