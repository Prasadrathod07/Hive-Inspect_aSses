-- AI Import Auditor metadata (requirements 19 and 20).
--
-- This table records that an AI explanation was attempted, and what came back.
-- It is deliberately a LEAF: it references import_runs and nothing references
-- it. There is no foreign key to templates/sections/items/comments, no trigger,
-- and no function that writes to them from here. The strongest statement of
-- the safety property this table exists to preserve is structural — there is
-- no path, through this schema, by which an AI result can alter migrated
-- content. A row here is a note about an explanation, never the explanation
-- becoming data.
--
-- `output` stores only a response that already passed strict schema validation
-- AND the issue-id allowlist check (src/lib/ai/audit-schema.ts). A rejected
-- response is recorded with status 'invalid_output' and its reason, but its
-- content is not persisted as though it were usable.

create table if not exists ai_audits (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,

  -- succeeded      : validated output, safe to display
  -- invalid_output : model responded, but failed schema or the id allowlist
  -- provider_error : never got a usable response (network, timeout, HTTP error)
  status text not null check (status in ('succeeded', 'invalid_output', 'provider_error')),

  provider text,
  model text,
  risk_level text check (risk_level in ('low', 'medium', 'high')),

  -- Validated output only. Null for both failure statuses.
  output jsonb,

  -- Operator-facing detail (schema violations, unknown ids, transport errors).
  -- Never rendered in the browser; see docs/decision-log.md D12.
  failure_reason text,

  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_audits_import_run_id_idx on ai_audits (import_run_id);
create index if not exists ai_audits_run_created_idx on ai_audits (import_run_id, created_at desc);

-- Same posture as every other table here: RLS on with no policies, so only the
-- service role (server-side) can read or write. See migration
-- 20260915000000_import_pipeline.sql.
alter table ai_audits enable row level security;

grant select, insert on ai_audits to service_role;
