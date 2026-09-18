-- Adds a resolution-status workflow to import_issues, for the Issue Review
-- page (/imports/[importRunId]/issues).
--
-- 'open' and 'accepted' are set by a human reviewer, through
-- src/lib/persistence/issue-actions.ts. 'resolved' is reserved for when the
-- underlying content gets fixed through an actual template edit — since
-- editing (requirement 4) isn't built yet, nothing in this phase sets
-- 'resolved' automatically; it exists now so that future work doesn't need
-- another migration for it.

alter table import_issues
  add column if not exists resolution_status text not null default 'open'
    check (resolution_status in ('open', 'accepted', 'resolved'));

create index if not exists import_issues_resolution_status_idx on import_issues (resolution_status);
