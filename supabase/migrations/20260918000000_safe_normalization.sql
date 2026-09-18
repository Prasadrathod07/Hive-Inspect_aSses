-- Safe Normalization / Recoverable Content / Manual Review split
-- (docs/architecture.md §5a). Adds:
--   1. Three columns on import_issues so a Level-B ("Fix Safely") issue can
--      carry its own proposed replacement content, computed once at import
--      time and never silently applied.
--   2. normalization_events — the Level-A silent-normalization audit trail.
--      A dedicated table, not JSONB on import_runs, because it needs to be
--      counted/grouped-by-type for the Import Report's "N harmless
--      normalizations applied" line — the same reasoning that already put
--      import_issues in its own table rather than import_runs' JSONB blob.
--   3. apply_issue_fix(uuid) — the one place a Level-B fix is actually
--      applied. One function body, one implicit transaction (same pattern as
--      import_template/duplicate_template, docs/decision-log.md D7): the
--      comment update and the issue's resolution both commit together, or
--      neither does.

alter table import_issues
  add column if not exists fix_safely_available boolean not null default false,
  add column if not exists proposed_plain_text text,
  add column if not exists proposed_safe_html text,
  add column if not exists applied_fix_at timestamptz;

create table if not exists normalization_events (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,
  event_type text not null check (event_type in (
    'whitespace_trimmed',
    'duplicate_whitespace_collapsed',
    'empty_tag_removed',
    'harmless_wrapper_removed',
    'line_break_normalized',
    'html_entity_decoded',
    'formatting_normalized',
    'safe_link_normalized'
  )),
  source_sheet text not null,
  source_row_number integer not null,
  description text not null,
  before_hash text not null,
  after_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists normalization_events_import_run_id_idx on normalization_events (import_run_id);
create index if not exists normalization_events_type_idx on normalization_events (import_run_id, event_type);

alter table normalization_events enable row level security;
grant select, insert on normalization_events to service_role;

-- Re-declared with the same signature: adds fix_safely_available /
-- proposed_plain_text / proposed_safe_html to the import_issues insert.
-- Everything else is byte-for-byte the same as
-- 20260915000000_import_pipeline.sql.
create or replace function import_template(payload jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_template_id uuid;
  v_import_run_id uuid;
  v_section jsonb;
  v_item jsonb;
  v_comment jsonb;
  v_issue jsonb;
  v_section_id uuid;
  v_item_id uuid;
  v_section_count integer := 0;
  v_item_count integer := 0;
  v_comment_count integer := 0;
  v_issue_count integer;
begin
  insert into templates (name, source_filename, source_file_sha256)
  values (
    payload->'template'->>'name',
    payload->>'source_filename',
    payload->>'source_file_sha256'
  )
  returning id into v_template_id;

  for v_section in select * from jsonb_array_elements(coalesce(payload->'template'->'sections', '[]'::jsonb))
  loop
    insert into sections (template_id, name, order_index, source_sheet, source_row_number)
    values (
      v_template_id,
      v_section->>'name',
      (v_section->>'position')::integer,
      v_section->>'source_sheet',
      (v_section->>'source_row_number')::integer
    )
    returning id into v_section_id;
    v_section_count := v_section_count + 1;

    for v_item in select * from jsonb_array_elements(coalesce(v_section->'items', '[]'::jsonb))
    loop
      insert into items (section_id, name, order_index, source_sheet, source_row_number)
      values (
        v_section_id,
        v_item->>'name',
        (v_item->>'position')::integer,
        v_item->>'source_sheet',
        (v_item->>'source_row_number')::integer
      )
      returning id into v_item_id;
      v_item_count := v_item_count + 1;

      for v_comment in select * from jsonb_array_elements(coalesce(v_item->'comments', '[]'::jsonb))
      loop
        insert into comments (item_id, plain_text, safe_html, order_index, source_sheet, source_row_number, link_metadata)
        values (
          v_item_id,
          v_comment->>'plain_text',
          v_comment->>'safe_html',
          (v_comment->>'position')::integer,
          v_comment->>'source_sheet',
          (v_comment->>'source_row_number')::integer,
          v_comment->'link_metadata'
        );
        v_comment_count := v_comment_count + 1;
      end loop;
    end loop;
  end loop;

  v_issue_count := jsonb_array_length(coalesce(payload->'issues', '[]'::jsonb));

  insert into import_runs (
    template_id, source_filename, source_file_sha256, status,
    section_count, item_count, comment_count, issue_count, completed_at
  )
  values (
    v_template_id, payload->>'source_filename', payload->>'source_file_sha256', 'succeeded',
    v_section_count, v_item_count, v_comment_count, v_issue_count, now()
  )
  returning id into v_import_run_id;

  for v_issue in select * from jsonb_array_elements(coalesce(payload->'issues', '[]'::jsonb))
  loop
    insert into import_issues (
      import_run_id, category, severity, source_sheet, source_row_number,
      explanation, raw_snippet, imported_preview,
      fix_safely_available, proposed_plain_text, proposed_safe_html
    )
    values (
      v_import_run_id,
      v_issue->>'category',
      v_issue->>'severity',
      v_issue->>'source_sheet',
      (v_issue->>'source_row_number')::integer,
      v_issue->>'explanation',
      v_issue->>'raw_snippet',
      v_issue->>'imported_preview',
      coalesce((v_issue->>'fix_safely_available')::boolean, false),
      v_issue->>'proposed_plain_text',
      v_issue->>'proposed_safe_html'
    );
  end loop;

  return jsonb_build_object(
    'template_id', v_template_id,
    'import_run_id', v_import_run_id,
    'section_count', v_section_count,
    'item_count', v_item_count,
    'comment_count', v_comment_count,
    'issue_count', v_issue_count
  );
end;
$$;

revoke all on function import_template(jsonb) from public;
grant execute on function import_template(jsonb) to service_role;

-- Applies exactly the proposed fix already computed and shown to the
-- reviewer at import time (never a value passed in fresh from the client —
-- what gets applied is provably identical to what was previewed). Comment
-- lookup is scoped to this issue's own template via the run, so this can
-- never touch a row belonging to a different template.
create or replace function apply_issue_fix(p_issue_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_issue record;
  v_template_id uuid;
  v_comment_id uuid;
begin
  select * into v_issue from import_issues where id = p_issue_id;
  if not found then
    raise exception 'Issue % not found', p_issue_id;
  end if;

  if not v_issue.fix_safely_available then
    raise exception 'Issue % has no safe fix available', p_issue_id;
  end if;

  if v_issue.resolution_status = 'resolved' then
    raise exception 'Issue % has already been resolved', p_issue_id;
  end if;

  select template_id into v_template_id from import_runs where id = v_issue.import_run_id;
  if v_template_id is null then
    raise exception 'Import run for issue % has no template', p_issue_id;
  end if;

  select c.id into v_comment_id
  from comments c
  join items i on i.id = c.item_id
  join sections s on s.id = i.section_id
  where s.template_id = v_template_id
    and c.source_sheet = v_issue.source_sheet
    and c.source_row_number = v_issue.source_row_number
  limit 1;

  if v_comment_id is null then
    raise exception 'No matching comment found for issue %', p_issue_id;
  end if;

  update comments
  set plain_text = v_issue.proposed_plain_text,
      safe_html = v_issue.proposed_safe_html
  where id = v_comment_id;

  update import_issues
  set resolution_status = 'resolved',
      applied_fix_at = now()
  where id = p_issue_id;

  return jsonb_build_object('comment_id', v_comment_id, 'issue_id', p_issue_id);
end;
$$;

revoke all on function apply_issue_fix(uuid) from public;
grant execute on function apply_issue_fix(uuid) to service_role;
