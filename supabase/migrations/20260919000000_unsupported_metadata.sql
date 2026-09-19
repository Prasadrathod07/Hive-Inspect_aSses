-- Fixes two product/data-model bugs found against the real Spectora export
-- (docs/decision-log.md D17):
--
--   1. An empty, attribute-bearing embed wrapper (e.g. a leftover
--      `<div class="youtube-embed-wrapper">` placeholder with nothing inside)
--      was being held as a "Recoverable content" issue (Level B, "Fix
--      Safely") even though it carries zero content to fix. It's now
--      silently removed as Level A safe normalization instead, recorded as a
--      new `empty_embed_wrapper_removed` normalization event.
--
--   2. A row whose primary section/item/comment content mapped successfully
--      was still being flagged as `unrecognized_row` ("unsupported source
--      content") whenever it also carried extra, unmodeled Spectora columns
--      (field type, checkbox options, defaults, timestamps, etc.) — making a
--      correctly-imported template look almost entirely unsupported. New
--      imports now classify that case as `unsupported_metadata` instead,
--      a category `import_issues.category` (plain `text`, no CHECK
--      constraint) already accepts with no schema change.
--
-- Historical import runs created before this migration keep their existing
-- `unrecognized_row` rows exactly as classified at the time — this migration
-- does not rewrite `import_issues` or `normalization_events` history, since
-- reclassifying past issues would require re-deriving "did this row's
-- content actually map" from data this migration has no safe way to
-- recompute retroactively. `get-import-run-issues.ts`'s existing
-- `rowGenuinelyUnsupported` cross-check against `sourceCoverage` (computed
-- from that run's own persisted `integrity_result`) still correctly
-- distinguishes the two cases for historical runs; the Issue Review UI
-- already collapses the non-genuine ones for those runs. A template only
-- gets the new, precise category split by being re-imported.

alter table normalization_events drop constraint if exists normalization_events_event_type_check;

alter table normalization_events
  add constraint normalization_events_event_type_check check (event_type in (
    'whitespace_trimmed',
    'duplicate_whitespace_collapsed',
    'empty_tag_removed',
    'harmless_wrapper_removed',
    'line_break_normalized',
    'html_entity_decoded',
    'formatting_normalized',
    'safe_link_normalized',
    'empty_embed_wrapper_removed'
  ));
