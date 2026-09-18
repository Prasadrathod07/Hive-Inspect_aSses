-- Adds the Import Integrity Engine's output to import_runs
-- (docs/architecture.md §2.8, src/lib/integrity/).
--
-- Replaces the single `integrity_verified boolean` column from the
-- previous migration with a richer, honest status plus the full computed
-- result. A boolean can only say "trustworthy or not" — this product's
-- whole differentiator is refusing to collapse that into one bit (or worse,
-- into a fabricated percentage score); see docs/decision-log.md D9.
--
-- integrity_status/integrity_result stay null for a 'failed' import_runs
-- row (status = 'failed' at the run level) — there's no template to verify
-- when nothing was persisted.

alter table import_runs
  drop column if exists integrity_verified;

alter table import_runs
  add column if not exists integrity_status text
    check (integrity_status in ('verified', 'verified_with_warnings', 'review_required', 'failed')),
  add column if not exists integrity_result jsonb;

create index if not exists import_runs_integrity_status_idx on import_runs (integrity_status);
