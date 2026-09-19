# Deployment (Vercel + Supabase)

This is the exact sequence to take this repository from "cloned" to "a
reviewer can open the live URL and explore a real, imported template."

No step here was run by an AI agent against real infrastructure — this repo
was prepared for deployment, not deployed. See "What was verified vs. what
wasn't" at the end.

## 1. Create and configure Supabase

1. Create a project at [supabase.com](https://supabase.com) (any region).
2. From **Project Settings → API**, note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (under "Project API keys", NOT the `anon` key) →
     `SUPABASE_SERVICE_ROLE_KEY`. Treat this like a root database password —
     it bypasses every RLS policy. Never commit it, never put it in a
     `NEXT_PUBLIC_` variable.
3. From **Project Settings → Database → Connection string** (URI, "Session
   pooler" or direct — either works for running migrations), copy the
   connection string with your password substituted in →
   `DATABASE_URL`. This is only used from your own machine to apply
   migrations; the deployed app never reads it (see step 4).
4. Put all three in your local `.env` (copy `.env.example` first).

## 2. Run migrations

Apply all seven migrations, **in this exact order** — later ones alter or
depend on earlier ones:

```
supabase/migrations/20260915000000_import_pipeline.sql
supabase/migrations/20260915010000_import_integrity.sql
supabase/migrations/20260915020000_import_issue_resolution.sql
supabase/migrations/20260916000000_template_duplication.sql
supabase/migrations/20260917000000_ai_audits.sql
supabase/migrations/20260918000000_safe_normalization.sql
supabase/migrations/20260919000000_unsupported_metadata.sql
```

**Option A — Supabase SQL Editor** (no local Postgres tooling needed): open
each file in order, paste its contents into the SQL Editor, run it, confirm
no error, move to the next file.

**Option B — CLI**, if you have the Supabase CLI and network access to the
project's Postgres host:

```bash
supabase db push
# or, file by file:
psql "$DATABASE_URL" -f supabase/migrations/20260915000000_import_pipeline.sql
psql "$DATABASE_URL" -f supabase/migrations/20260915010000_import_integrity.sql
psql "$DATABASE_URL" -f supabase/migrations/20260915020000_import_issue_resolution.sql
psql "$DATABASE_URL" -f supabase/migrations/20260916000000_template_duplication.sql
psql "$DATABASE_URL" -f supabase/migrations/20260917000000_ai_audits.sql
psql "$DATABASE_URL" -f supabase/migrations/20260918000000_safe_normalization.sql
psql "$DATABASE_URL" -f supabase/migrations/20260919000000_unsupported_metadata.sql
```

Every table gets RLS enabled with **no policies** by design — only the
service-role key (used server-side only) can read or write anything. There is
nothing to configure here beyond running the files; no RLS policies to write,
no auth setup.

**Verify**: run `npm run test -- import-service.integration` locally with
`RUN_SUPABASE_INTEGRATION_TESTS=1` and `SUPABASE_SERVICE_ROLE_KEY` pointed at
this project (see `docs/testing.md`). See `docs/db-verification.md` for a
manual SQL-only verification if you'd rather not run the test suite.

## 3. Seed

The reviewer-facing app needs a template already imported and explorable
before anyone opens it (assessment requirement 15). `npm run seed` does that
through the real import pipeline — the same `runSpectoraImport` function
`POST /api/import` calls, never a hand-built database row. Full design
rationale: `docs/decision-log.md` D14; full behavior: `scripts/seed-demo.ts`.

```bash
npm run seed              # requires the real Spectora export in
                           # sample-data/spectora/ — see its README.
npm run seed -- --reset   # deletes only this script's own seeded run/template
```

**Bare `npm run seed` refuses to seed anything if no real export is
present** — it prints a BLOCKER and exits non-zero rather than silently
substituting synthetic data. As of this writing, **no real Spectora export
exists in this repository**, so seeding has not happened and cannot happen
until one is added. See `sample-data/spectora/README.md` for exactly what's
needed and `docs/requirements-matrix.md` rows 15/16.

For exercising the demo mechanics locally before the real file exists:

```bash
npm run seed -- --allow-synthetic
```

This seeds `tests/fixtures/synthetic-spectora-like.xlsx` under a template
name that says "SYNTHETIC DEMO" everywhere it's displayed. **It does not
satisfy requirements 15/16** and must not be left seeded in the production
database at submission time — reset it (`npm run seed -- --reset
--allow-synthetic`) once the real export is available, then run a plain
`npm run seed`.

Run this against your production Supabase project from your own machine
(`.env` pointed at it), not from Vercel — there's no seed step in the Vercel
build; seeding is a one-time, deliberate action a person takes, not something
that happens automatically on every deploy.

## 4. Configure Vercel environment variables

In the Vercel project → **Settings → Environment Variables**:

| Variable | Value | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL | **Yes** | Public by design — it's an endpoint, not a credential |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key | **Yes** | **Secret.** Do not expose to a `NEXT_PUBLIC_` variable. This app never sends it to the browser (verified — see "What was verified" below) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | No | Not currently read by any code path in this app. Fine to set for completeness, fine to omit |
| `AI_AUDITOR_ENABLED` | `true` or omit | No | Omit (or `false`) to ship without the AI Import Auditor. The app is fully functional either way — see `docs/ai-auditor.md` |
| `ANTHROPIC_API_KEY` | your key | Only if `AI_AUDITOR_ENABLED=true` | **Secret** |
| `AI_AUDITOR_MODEL` | e.g. `claude-sonnet-5` | No | Defaults if unset |
| `AI_AUDITOR_TIMEOUT_MS` | e.g. `20000` | No | Defaults if unset |

**Do not set these in Vercel:**

- `DATABASE_URL` — a direct Postgres connection string the running app never
  reads. Setting it there is pure unnecessary secret exposure for zero
  benefit; it's only ever used from a developer machine to run migrations
  (step 2).
- `RUN_SUPABASE_INTEGRATION_TESTS` — a local/CI test-only flag, meaningless
  to the running app.

Set every variable for the **Production** environment (and Preview, if you
want preview deployments to also work against real data — they'll share the
same database unless you point Preview at a second Supabase project).

## 5. Deploy

Either connect the GitHub repo in the Vercel dashboard (Import Project →
select this repo → it auto-detects Next.js, no configuration needed — there
is no `vercel.json`), or from the CLI:

```bash
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

Nothing in this project needs custom build settings. `package.json` pins
`engines.node` to `22.x` (see "What was verified" — that's the version this
whole app has actually been built and tested against; Vercel's own default
is currently 24.x, untested here) — Vercel reads that automatically.

## 6. Verify the live URL

1. **`GET https://<your-app>.vercel.app/api/health`** first — this exists
   specifically so you don't have to click through the UI to find out
   Supabase isn't reachable. Expect:
   ```json
   {"status":"ok","checks":{"supabaseConfigured":true,"supabaseReachable":true},"timestamp":"…"}
   ```
   A `503` with `supabaseConfigured: false` means an env var is missing or
   wrong in step 4. A `503` with `supabaseConfigured: true,
   supabaseReachable: false` means the env vars are present but something's
   actually wrong reaching the database (migrations not applied, project
   paused, wrong URL).
2. Open `/` — the seeded template (step 3) should be the first thing you
   see: name, integrity status badge, Open / Import Report / Duplicate
   buttons. No login screen, ever.
3. Run through the **production smoke checklist** below.

## Production smoke checklist

Run this after every deploy that touches persistence, the importer, or the
editor — not just the first one.

- [ ] `/api/health` returns `200` with both checks `true`
- [ ] `/` loads with no login prompt and shows the seeded template
- [ ] Template card shows a real integrity status badge (not "No integrity
      result")
- [ ] **Open** → template editor loads, hierarchy tree populated
- [ ] Edit a section name → "Saving…" → "Saved ✓"; refresh the page → the
      edit is still there (proves the write reached Postgres, not just
      local state)
- [ ] **Import Report** → shows real structure counts, ordering, text
      preservation, links, and the "N unaccounted source rows" line —
      never a fabricated percentage
- [ ] **Duplicate** → creates a copy, navigates to it, editing the copy does
      **not** change the original (reload the original's editor to confirm)
- [ ] Upload a `.txt` file at `/import` → rejected with the real reason
      ("Unsupported file type…"), not a platform-level or opaque error
- [ ] Upload a file just over 4MB → rejected with "That file is larger than
      the 4MB limit…", **not** a raw Vercel `413 FUNCTION_PAYLOAD_TOO_LARGE`
      (if you see the raw platform error instead of this app's message, the
      file exceeded Vercel's own 4.5MB hard limit before reaching the app —
      expected only for files *near* that ceiling, not for a normal
      spreadsheet export)
- [ ] View source on any page — confirm no service-role key, connection
      string, or API key appears anywhere in the HTML or `.js` served to
      the browser (`curl -s <url> | grep -i "service_role\|sk-ant"` should
      find nothing)
- [ ] If `AI_AUDITOR_ENABLED=true`: the "AI Import Review" section on the
      import report resolves to either a real summary or one of the two
      honest fallback messages — never blank, never stuck loading forever

## What was verified vs. what wasn't

**Verified from this environment**, against the real code:

- `npm run build` succeeds (Next.js production build, TypeScript, static +
  dynamic route generation all clean).
- Every server route (`/api/import`, `/api/health`) declares
  `export const runtime = "nodejs"` and uses only Node-runtime-compatible
  APIs (`node:crypto`, the `xlsx` package — confirmed pure JavaScript, no
  native bindings, so it needs nothing beyond what Vercel's Node.js runtime
  already provides).
- `SUPABASE_SERVICE_ROLE_KEY` does not appear anywhere in `.next/static`
  after a real production build (checked directly, not assumed).
- No `localStorage`/`sessionStorage` usage anywhere in the app — every write
  goes to Postgres via a Server Action or Route Handler.
- No filesystem read/write anywhere in `src/` (the deployed app). The seed
  script (`scripts/seed-demo.ts`) does read the filesystem, but it's a local
  CLI tool, never imported by any route — confirmed absent from the client
  bundle and never invoked by the deployed app itself.
- No `localhost` or hardcoded non-production URL anywhere in `src/`
  (excluding test files, where constructing a `Request` object requires
  *some* absolute URL by the Fetch API's own contract).
- The **request-body size limit is a genuine, previously-undetected
  production bug that this pass found and fixed**: Vercel enforces a hard,
  non-configurable 4.5MB request body limit on every plan
  (verified directly against current Vercel documentation, not assumed from
  training data — see the comment on `MAX_FILE_SIZE_BYTES` in
  `src/lib/import/validate-file.ts`). The app previously advertised and
  accepted uploads "up to 20MB," which would have failed with an opaque
  platform-level `413` for any file over 4.5MB — never reaching this app's
  own honest error handling. The limit is now 4MB, with headroom under the
  platform ceiling for multipart overhead, and every place that referenced
  the old number (UI copy, error catalog, docs) now derives from the same
  constant so they can't drift apart again.
- `.env.example` lists every environment variable the code actually reads
  (verified by grepping every `process.env.*`/injected-`env.*` reference in
  `src/` and `scripts/`), and explicitly separates required-in-Vercel from
  present-but-unused (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) from
  never-in-Vercel (`DATABASE_URL`, `RUN_SUPABASE_INTEGRATION_TESTS`).

**Not verified — cannot be, from this environment:**

- No actual deployment was performed. There is no Vercel CLI authentication
  available here, and doing so was explicitly out of scope
  ("do not deploy automatically unless credentials/tooling are already
  configured and safe" — they are not).
- Migrations have not been applied to any live Supabase project from this
  session (this environment has no outbound route to Supabase's direct
  Postgres host — `docs/decision-log.md` D7).
- `npm run seed` has never succeeded against a live database — see
  `docs/requirements-matrix.md` rows 15/16 and `docs/testing.md`
  "Coverage gaps." It has been run locally and confirmed to fail *honestly*
  in the two states it's actually in (no real export; no service-role key).
- The production smoke checklist above has never actually been run against
  a live URL. It's written so that whoever deploys this can run it in about
  five minutes and know immediately whether the deploy is sound.
