# Spectora Sample Export — Missing

**No real Spectora export exists in this repository yet.** A full search of the
repo (`find . -iname "*.xlsx" -o -iname "*.xls"`) at the time this file was
last checked found zero spreadsheet files anywhere except the synthetic
engineering fixture under `tests/fixtures/`.

Assessment requirements 15 and 16 require the repo to include the actual
Spectora "Export to spreadsheet → Export HTML Text" file used for this
submission, and the deployed app to already have it imported and explorable.
Neither is possible without this file. **This is a BLOCKER for final
submission**, not a cosmetic gap.

```
sample-data/spectora/<real-export-filename>.xlsx
```

## What must happen before submission

1. Obtain the real Spectora "Export to spreadsheet → Export HTML Text" export
   for the assessment's inspection template.
2. Place it in this directory, **unmodified** — same bytes, same filename as
   exported. Do not open and re-save it, do not rename its internal sheet,
   do not strip anything from it. If it needs to be trimmed for size or
   privacy, that trimming must happen *before* export from Spectora, not by
   hand-editing the exported file afterward — otherwise this file is no
   longer evidence of what the importer actually handles.
3. Fill in every field below in this README.
4. Run `npm run seed` (see `scripts/seed-demo.ts`). It imports this file
   through the exact same deterministic parser and atomic-write pipeline
   `POST /api/import` uses — never a hand-built database row — and is safe
   to run more than once (idempotent by content hash).
5. Update `docs/requirements-matrix.md` rows 15 and 16 from `BLOCKED` to
   `DONE`.
6. Do not commit any other spreadsheet as a stand-in for this one — see
   "Synthetic fixtures" below.

## Required disclosure (fill in before submission)

| Field | Value |
|---|---|
| **Template name** | _(the inspection template's name, as it appears in Spectora)_ |
| **Spectora source** | _(which Spectora account/organization this was exported from — company name is fine, no credentials)_ |
| **Export method** | Spectora → *Export to spreadsheet* → *Export HTML Text* _(confirm this exact path was used; if Spectora's UI wording differs, note the actual steps taken)_ |
| **Contains real customer information?** | _(state explicitly: **No** — confirm the template itself, not a completed inspection report, was exported, and that no client name, property address, or photo of a real property is present anywhere in the file)_ |

The last row is not optional. A Spectora *template* export should contain
only section/item/comment structure — no client data — but that must be
**verified by opening the file**, not assumed from the export type, before
it's committed to a public repository.

## Synthetic fixtures

Until the real export is available, structural development and testing (e.g.
proving the parser isn't hard-coded to a single file — requirement 10) uses
hand-built synthetic `.xlsx` fixtures that mimic the Spectora HTML-text export
structure. Any such fixture:

- Lives under `tests/fixtures/` (engineering test fixtures) — never directly
  in `sample-data/spectora/`, which is reserved for the real export.
- Is named with a `synthetic-` prefix.
- Is referenced in code/tests and in `NOTES.md` explicitly as synthetic, never
  presented as "the" assessment sample.

`npm run seed -- --allow-synthetic` seeds the demo template from that
synthetic fixture, under a template name that says "SYNTHETIC DEMO" wherever
it's displayed in the app, purely so the demo mechanics (dashboard → report →
editor → duplicate) can be exercised locally before the real file exists.
**It does not satisfy requirements 15 or 16** — see
`docs/requirements-matrix.md`.

This directory currently contains no real export. This README exists so that
its absence is a documented, visible fact rather than a silent gap.
