# Spectora Sample Export — Missing

**No real Spectora export exists in this repository yet.** A full search of the
repo (`find . -iname "*.xlsx" -o -iname "*.xls"`) at the time this file was
written found zero spreadsheet files anywhere.

Assessment requirement 16 requires the repo to include the actual Spectora
"Export to spreadsheet → Export HTML Text" file used for development and
testing. That file must be added here before final submission:

```
sample-data/spectora/<real-export-filename>.xlsx
```

## What must happen before submission

1. Obtain the real Spectora "Export to spreadsheet → Export HTML Text" export
   for the assessment's inspection template.
2. Place it in this directory, unmodified, with its original filename (or a
   clearly descriptive one if the original is not meaningful).
3. Update `docs/requirements-matrix.md` row 16 from `BLOCKED` to `DONE`, and
   reference this file's path from wherever the importer's test fixtures are
   wired up.
4. Do not commit any other spreadsheet as a stand-in for this one. See below.

## Synthetic fixtures

Until the real export is available, structural development and testing (e.g.
proving the parser isn't hard-coded to a single file — requirement 10) may use
hand-built synthetic `.xlsx` fixtures that mimic the Spectora HTML-text export
structure. Any such fixture:

- Lives under `sample-data/spectora/synthetic/`, never directly in
  `sample-data/spectora/`.
- Is named with a `synthetic-` prefix.
- Is referenced in code/tests and in `NOTES.md` explicitly as synthetic, never
  presented as "the" assessment sample.

This directory currently contains no files of either kind. This README exists
so that its absence is a documented, visible fact rather than a silent gap.
