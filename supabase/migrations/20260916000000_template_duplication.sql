-- Independent template duplication (assessment requirement 6).
--
-- Two changes:
--   1. `templates.duplicated_from_id` is renamed to `parent_template_id`.
--      Same column, same purpose (lineage back to the template this one was
--      copied from) — renamed to the name the requirement specifies. It has
--      never held data, since duplication didn't exist until now.
--   2. `duplicate_template(uuid, text)` — an atomic deep copy.
--
-- WHAT IS AND ISN'T COPIED
--   Copied:     templates, sections, items, comments — every row with a NEW id.
--   Not copied: import_runs, import_issues.
--
-- A duplicate is NOT a fresh Spectora import, so fabricating an import run
-- for it would be a lie: nothing was imported, validated, or integrity-checked.
-- The copy therefore has no import run and no integrity status of its own;
-- its provenance is the lineage link plus the per-row source_sheet /
-- source_row_number values, which are carried over because they remain
-- true — that content really did originate at that row of that sheet.

alter table templates rename column duplicated_from_id to parent_template_id;
create index if not exists templates_parent_template_id_idx on templates (parent_template_id);

-- Like import_template, this is one PL/pgSQL function body and therefore one
-- implicit transaction: if any insert raises, every insert this call made —
-- including the new templates row — rolls back. There is no code path that
-- can leave a half-duplicated template behind (docs/decision-log.md D7).
--
-- Written as nested loops rather than set-based CTEs on purpose: each level
-- needs the NEW parent id to attach its children to, and the loop makes that
-- mapping obvious to a reader. Cost is one insert per copied row, which is
-- unremarkable at inspection-template sizes.
create or replace function duplicate_template(source_template_id uuid, new_name text)
returns jsonb
language plpgsql
as $$
declare
  v_source templates%rowtype;
  v_new_template_id uuid;
  v_section record;
  v_item record;
  v_new_section_id uuid;
  v_new_item_id uuid;
  v_section_count integer := 0;
  v_item_count integer := 0;
  v_comment_count integer := 0;
  v_inserted_comments integer;
begin
  select * into v_source from templates where id = source_template_id;
  if not found then
    raise exception 'Template % does not exist', source_template_id;
  end if;

  if new_name is null or btrim(new_name) = '' then
    raise exception 'A name is required for the duplicated template';
  end if;

  insert into templates (name, source_filename, source_file_sha256, parent_template_id)
  values (btrim(new_name), v_source.source_filename, v_source.source_file_sha256, v_source.id)
  returning id into v_new_template_id;

  for v_section in
    select * from sections where template_id = source_template_id order by order_index
  loop
    insert into sections (template_id, name, order_index, source_sheet, source_row_number)
    values (
      v_new_template_id,
      v_section.name,
      v_section.order_index,
      v_section.source_sheet,
      v_section.source_row_number
    )
    returning id into v_new_section_id;
    v_section_count := v_section_count + 1;

    for v_item in
      select * from items where section_id = v_section.id order by order_index
    loop
      insert into items (section_id, name, order_index, source_sheet, source_row_number)
      values (
        v_new_section_id,
        v_item.name,
        v_item.order_index,
        v_item.source_sheet,
        v_item.source_row_number
      )
      returning id into v_new_item_id;
      v_item_count := v_item_count + 1;

      insert into comments (
        item_id, plain_text, safe_html, order_index, source_sheet, source_row_number, link_metadata
      )
      select
        v_new_item_id, c.plain_text, c.safe_html, c.order_index, c.source_sheet, c.source_row_number, c.link_metadata
      from comments c
      where c.item_id = v_item.id;

      get diagnostics v_inserted_comments = row_count;
      v_comment_count := v_comment_count + v_inserted_comments;
    end loop;
  end loop;

  return jsonb_build_object(
    'template_id', v_new_template_id,
    'parent_template_id', v_source.id,
    'name', btrim(new_name),
    'section_count', v_section_count,
    'item_count', v_item_count,
    'comment_count', v_comment_count
  );
end;
$$;

-- Same posture as import_template: this can create arbitrary templates, so
-- only the server-side service role may call it.
revoke all on function duplicate_template(uuid, text) from public;
grant execute on function duplicate_template(uuid, text) to service_role;
