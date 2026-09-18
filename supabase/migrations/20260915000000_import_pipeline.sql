-- Import pipeline schema: templates, their section/item/comment hierarchy,
-- and the import_runs/import_issues audit trail described in
-- docs/architecture.md §3 and §2.9 (atomic persistence).
--
-- Design notes:
--   * Every write path that creates a template goes through the
--     import_template(jsonb) function below, in one implicit transaction —
--     see docs/decision-log.md for why (an RPC function, not client-side
--     multi-step writes with compensating deletes).
--   * source_sheet/source_row_number are stored inline on sections/items/
--     comments rather than in a separate join table — this is the
--     "source-row traceability": every persisted node can answer "where did
--     this come from in the original file" from its own columns.
--   * RLS is enabled on every table with NO policies. This app has no
--     end-user auth (docs/decision-log.md D6); all reads and writes in this
--     phase happen server-side through the service-role key, which bypasses
--     RLS entirely. Locking tables down by default means the anon key (used
--     client-side) has zero access until a future phase deliberately adds a
--     policy for it.

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_filename text not null,
  source_file_sha256 text not null,
  duplicated_from_id uuid references templates (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates (id) on delete cascade,
  name text not null,
  order_index integer not null,
  source_sheet text not null,
  source_row_number integer not null,
  created_at timestamptz not null default now()
);
create index if not exists sections_template_id_idx on sections (template_id);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections (id) on delete cascade,
  name text not null,
  order_index integer not null,
  source_sheet text not null,
  source_row_number integer not null,
  created_at timestamptz not null default now()
);
create index if not exists items_section_id_idx on items (section_id);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  plain_text text not null,
  safe_html text,
  order_index integer not null,
  source_sheet text not null,
  source_row_number integer not null,
  link_metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists comments_item_id_idx on comments (item_id);

create table if not exists import_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates (id) on delete set null,
  source_filename text not null,
  source_file_sha256 text not null,
  status text not null check (status in ('succeeded', 'failed')),
  section_count integer not null default 0,
  item_count integer not null default 0,
  comment_count integer not null default 0,
  issue_count integer not null default 0,
  -- null until the post-write re-read verification step runs; only
  -- meaningful for status = 'succeeded' (a failed run never wrote a template).
  integrity_verified boolean,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists import_runs_template_id_idx on import_runs (template_id);

create table if not exists import_issues (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,
  category text not null,
  severity text not null,
  source_sheet text not null,
  source_row_number integer not null,
  explanation text not null,
  raw_snippet text not null,
  imported_preview text,
  created_at timestamptz not null default now()
);
create index if not exists import_issues_import_run_id_idx on import_issues (import_run_id);

alter table templates enable row level security;
alter table sections enable row level security;
alter table items enable row level security;
alter table comments enable row level security;
alter table import_runs enable row level security;
alter table import_issues enable row level security;

-- Atomic template persistence (docs/architecture.md §2.9).
--
-- Expected payload shape (see src/lib/persistence/import-payload.ts, the
-- TypeScript side of this contract):
--
-- {
--   "source_filename": string,
--   "source_file_sha256": string,
--   "template": {
--     "name": string,
--     "sections": [{
--       "name": string, "position": int, "source_sheet": string, "source_row_number": int,
--       "items": [{
--         "name": string, "position": int, "source_sheet": string, "source_row_number": int,
--         "comments": [{
--           "plain_text": string, "safe_html": string|null, "position": int,
--           "source_sheet": string, "source_row_number": int, "link_metadata": jsonb|null
--         }]
--       }]
--     }]
--   },
--   "issues": [{
--     "category": string, "severity": string, "source_sheet": string, "source_row_number": int,
--     "explanation": string, "raw_snippet": string, "imported_preview": string|null
--   }]
-- }
--
-- A PL/pgSQL function body is one implicit transaction: if any insert here
-- raises (a NOT NULL/type violation, a broken FK, anything), every insert
-- this call made — including the templates row — rolls back automatically.
-- There is no path that leaves a half-imported template behind; the caller
-- either gets a fully-populated template_id back, or an error and nothing
-- written at all.
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
      explanation, raw_snippet, imported_preview
    )
    values (
      v_import_run_id,
      v_issue->>'category',
      v_issue->>'severity',
      v_issue->>'source_sheet',
      (v_issue->>'source_row_number')::integer,
      v_issue->>'explanation',
      v_issue->>'raw_snippet',
      v_issue->>'imported_preview'
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

-- This function can create arbitrary templates — never let the public/anon
-- or authenticated roles call it. Only the server-side service-role key
-- (which already bypasses RLS entirely) is meant to invoke it.
revoke all on function import_template(jsonb) from public;
grant execute on function import_template(jsonb) to service_role;
