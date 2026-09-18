# Database verification steps

This repository's automated live-database tests are skip-gated (they need
`SUPABASE_SERVICE_ROLE_KEY` and an explicit opt-in — see
`docs/requirements-matrix.md` row 13 for why they haven't run yet). This
document is the manual equivalent: copy-pasteable SQL that confirms the same
claims directly in the Supabase SQL editor.

Run these **after** applying every migration in `supabase/migrations/`, in
filename order.

## 1. Schema is present

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
-- expect: ai_audits, comments, import_issues, import_runs, items,
--         normalization_events, sections, templates

select routine_name
from information_schema.routines
where routine_schema = 'public'
order by routine_name;
-- expect: apply_issue_fix, duplicate_template, import_template
```

## 2. Import writes atomically

Import a file through the app (`/import`), then:

```sql
select status, integrity_status, section_count, item_count, comment_count
from import_runs order by created_at desc limit 1;
```

A `failed` run must have `template_id is null` — a failure never leaves a
template behind:

```sql
select count(*) from import_runs where status = 'failed' and template_id is not null;
-- expect: 0
```

## 3. Duplication independence (requirement 6)

Substitute a real template id for `:source` throughout.

### 3a. Duplicate it

```sql
select duplicate_template(:source, 'Manual Verification — Copy');
-- returns template_id, parent_template_id, and the three counts
```

### 3b. Proof 1 — the copy has the same content

```sql
-- Section names, in order, for both templates. The two lists must match.
select 'original' as which, name, order_index from sections where template_id = :source
union all
select 'copy', name, order_index from sections where template_id = :copy
order by which, order_index;
```

```sql
-- Row counts must match exactly at all three levels.
select
  (select count(*) from sections where template_id = :source) as original_sections,
  (select count(*) from sections where template_id = :copy)   as copy_sections,
  (select count(*) from items i join sections s on i.section_id = s.id where s.template_id = :source) as original_items,
  (select count(*) from items i join sections s on i.section_id = s.id where s.template_id = :copy)   as copy_items,
  (select count(*) from comments c join items i on c.item_id = i.id join sections s on i.section_id = s.id where s.template_id = :source) as original_comments,
  (select count(*) from comments c join items i on c.item_id = i.id join sections s on i.section_id = s.id where s.template_id = :copy)   as copy_comments;
```

### 3c. Proof 2 — every id is different

This is the load-bearing one. It must return **zero rows**:

```sql
with original_ids as (
  select id from sections where template_id = :source
  union all
  select i.id from items i join sections s on i.section_id = s.id where s.template_id = :source
  union all
  select c.id from comments c join items i on c.item_id = i.id join sections s on i.section_id = s.id where s.template_id = :source
),
copy_ids as (
  select id from sections where template_id = :copy
  union all
  select i.id from items i join sections s on i.section_id = s.id where s.template_id = :copy
  union all
  select c.id from comments c join items i on c.item_id = i.id join sections s on i.section_id = s.id where s.template_id = :copy
)
select * from original_ids intersect select * from copy_ids;
-- expect: 0 rows — no section, item, or comment row is shared
```

### 3d. Proofs 3 and 4 — editing the copy doesn't touch the original

```sql
-- Rename one of the copy's sections.
update sections set name = 'Renamed on the copy only'
where id = (select id from sections where template_id = :copy order by order_index limit 1);

-- The original's corresponding section is unchanged.
select name from sections where template_id = :source order by order_index limit 1;
-- expect: the original name, NOT 'Renamed on the copy only'
```

```sql
-- Rewrite one of the copy's comments.
update comments set plain_text = 'Rewritten on the copy only.'
where id = (
  select c.id from comments c
  join items i on c.item_id = i.id
  join sections s on i.section_id = s.id
  where s.template_id = :copy
  order by s.order_index, i.order_index, c.order_index
  limit 1
);

-- The original's corresponding comment is unchanged.
select c.plain_text from comments c
join items i on c.item_id = i.id
join sections s on i.section_id = s.id
where s.template_id = :source
order by s.order_index, i.order_index, c.order_index
limit 1;
-- expect: the original text
```

### 3e. Proof 5 — deleting the copy doesn't touch the original

```sql
select count(*) from sections where template_id = :source;  -- note this number
delete from templates where id = :copy;                      -- cascades to the copy's rows
select count(*) from sections where template_id = :source;  -- must be the same number
```

### 3f. Proof 6 — a failed duplication leaves nothing behind

```sql
select count(*) from templates;  -- note this number

select duplicate_template('00000000-0000-0000-0000-000000000000', 'Should not exist');
-- expect: ERROR: Template 00000000-... does not exist

select count(*) from templates;  -- must be the same number
```

## 4. Lineage, not a fake import

A duplicate records where it came from, but is never presented as its own
Spectora import:

```sql
select id, name, parent_template_id from templates where parent_template_id is not null;
-- copies have a parent

select count(*) from import_runs r
join templates t on r.template_id = t.id
where t.parent_template_id is not null;
-- expect: 0 — no duplicate has an import run of its own
```
