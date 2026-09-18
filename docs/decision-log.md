# Decision Log

Each entry records a decision, the alternatives considered, and why the chosen
option won. Entries are append-only — if a decision is later reversed, add a new
entry rather than editing the old one, so the history of reasoning stays intact.

---

### D1 — Node/TypeScript for the whole stack, no separate Python backend

**Decision**: Implement parsing, normalization, integrity checking, and
persistence entirely in Node/TypeScript inside the Next.js app (route
handlers/server actions), rather than standing up a separate Python (or other)
backend service.

**Alternatives considered**: Python backend (e.g. FastAPI) for spreadsheet
parsing, with Next.js as a pure frontend calling it over HTTP.

**Why**: The assessment's tech stack explicitly specifies Next.js + Node
server-side handlers. SheetJS and a Zod-validated pipeline in TypeScript are
fully sufficient for XLSX parsing and structured validation — there's no
capability Python would add here. A second service would mean a second
deployment target, a second language's tooling, and a network hop between
"parse" and "persist," all of which cut against "prefer simple architecture
over unnecessary services" and "keep this codebase easy to explain in a live
interview." One deployable, one language, one type system shared between
parser output and UI.

---

### D2 — Supabase Postgres as the database

**Decision**: Use Supabase Postgres as the real backend/database.

**Alternatives considered**: SQLite/local file DB, a different managed Postgres
provider, Firebase/Firestore (document DB).

**Why**: Explicitly specified in the assessment's tech stack. Beyond that,
relational tables are a natural fit for the sections/items/comments hierarchy
and for atomic multi-row transactions (requirement: atomic persistence). A
Supabase project is already provisioned for this repo (see `.env` — URL and
anon key present; service role key still needs to be added before server-side
writes are implemented), so there's no infra to stand up from scratch.

---

### D3 — Deterministic parser, no AI in the import path

**Decision**: The Spectora → canonical-model pipeline (parsing, normalization,
hierarchy building, integrity checking) is 100% deterministic code. No LLM call
sits anywhere in that path.

**Alternatives considered**: Using an LLM to interpret ambiguous spreadsheet
rows or to "clean up" imported text.

**Why**: The whole premise of this assessment is that the customer's template
represents years of work and must be trustworthy after migration. A
non-deterministic step in the import path would make "did we preserve
everything" unanswerable with confidence, and would violate requirement 20
outright. Determinism also makes the pipeline testable with ordinary unit tests
instead of eval harnesses — a meaningful simplicity win for a project that has
to be explained live.

---

### D4 — Import Integrity is the primary product differentiator

**Decision**: The main engineering investment beyond the baseline CRUD/import
flow goes into a deterministic Import Integrity system (verification report,
preserved/changed/unsupported breakdown, absent-vs-unsupported distinction),
not into UI polish or the AI feature.

**Alternatives considered**: Investing primarily in editor UX polish; investing
primarily in the AI auditor as the headline feature.

**Why**: The assessment's own framing ("preserve customer work first, AI and
polish come after correctness") and the explicit differentiator instruction
("make the import easier to trust") both point the same direction. A trustworthy
migration tool has to prove trustworthiness, not just assert it — that proof is
the integrity engine and its report, and it's what a Forward Deployed Engineer
would actually be judged on by a skeptical customer.

---

### D5 — AI Auditor is a bonus layer, built only after the baseline is complete

**Decision**: No AI code is written until every non-AI requirement in
`docs/requirements-matrix.md` is DONE. The AI auditor, when built, is a
read-only explainer over already-computed integrity results (see
`docs/architecture.md` §7) — never a participant in import/edit/duplicate/
persist.

**Alternatives considered**: Building the AI feature in parallel with the
baseline, or leading with it as the flagship feature.

**Why**: Explicit assessment instruction (requirement 19) and explicit product
principle ("AI assists; AI does not control migration"). Sequencing it last also
means the baseline's correctness is never at risk of being obscured or
compensated for by an AI layer — if the deterministic system has a bug, an AI
explanation of its (wrong) output would actively hide that bug.

---

### D6 — No authentication unless a genuine requirement emerges

**Decision**: Ship without a login/auth system. The deployed app is openly
reachable.

**Alternatives considered**: Basic auth, Supabase Auth with a demo account,
magic-link email auth.

**Why**: Explicit assessment instruction — the reviewer should experience zero
unnecessary friction opening the live app. Auth adds real complexity (session
handling, protected routes, credential management for the reviewer) for a
single-tenant assessment demo with no sensitive user data. If a genuine need
emerges (e.g. protecting write actions on the public deployment from abuse), a
narrow mitigation (e.g. rate limiting, or read-only public view + separate
edit path) will be reconsidered and logged as a new decision — not full user
auth by default.

---

### D7 — Atomic persistence via a single Postgres function, not client-side compensating deletes

**Decision**: Template persistence (`templates` + `sections` + `items` +
`comments` + the `import_runs`/`import_issues` audit trail) happens inside
one PL/pgSQL function, `import_template(jsonb)`
(`supabase/migrations/20260915000000_import_pipeline.sql`), called once via
`supabase-js`'s `.rpc()`. The Node import service
(`src/lib/persistence/import-service.ts`) never issues a sequence of
separate inserts for the template tree and never deletes rows to "undo" a
partial write.

**Alternatives considered**: Issuing sequential `.insert()` calls from
Node for templates → sections → items → comments, and deleting everything
written so far if a later step fails (a compensating-delete/saga pattern);
using the Supabase JS client's (nonexistent, for this use case) multi-table
transaction helper; a direct `pg`/`DATABASE_URL` connection from Node
wrapped in an explicit `BEGIN`/`COMMIT`.

**Why**: `supabase-js` talks to Postgres over PostgREST (HTTP), where each
`.from(...).insert(...)` call is its own independent transaction — there is
no way to span multiple REST calls in one client-side transaction. A
sequence-of-inserts-plus-compensating-deletes approach is exactly the
"brittle client-side compensating deletes" this phase was told not to rely
on as the *primary* strategy: a crashed process, a network blip, or a bug in
the cleanup path between steps N and N+1 leaves exactly the half-imported
template the whole project's GOAL says must never happen. A PL/pgSQL
function body is a single implicit transaction enforced by Postgres itself
— if any insert inside it raises, everything the function did rolls back
automatically, with no cleanup code to get wrong. The Node service still
does one small, genuinely non-atomic follow-up step (recording a `'failed'`
`import_runs` row when parsing or the RPC call itself fails) — but that step
never risks a half-written *template*, only a best-effort audit record of a
failure that, by construction, wrote no template rows at all.

**A direct `DATABASE_URL` connection** was ruled out for this environment
specifically: this project's direct-connection hostname
(`db.<ref>.supabase.co`) resolves to an IPv6-only address, and the sandbox
this was built in has no outbound IPv6 route (confirmed: DNS resolves an
AAAA record, no A record; a raw TCP connect attempt to the IPv6 address
returns `ENETUNREACH`). The `supabase-js` REST/RPC path uses ordinary HTTPS
and was confirmed reachable. This also means the migration itself could not
be applied from this session — see `docs/requirements-matrix.md` row 13 and
the README for manual application instructions (Supabase SQL Editor, or
`supabase db push` from a machine with normal network access).

---

### D8 — Every import attempt gets an `import_runs` row, including early failures

**Decision**: The import service records an `import_runs` row for every
attempt — including ones that fail before ever reaching the database (a
corrupt file, an unrecognized layout) — not only for attempts that get far
enough to call `import_template`.

**Alternatives considered**: Only creating an `import_runs` row once parsing
succeeds, and returning file-validation/parse errors directly to the caller
without persisting anything.

**Why**: Requirement 12 asks the product to *demonstrate* a failure case,
not just handle one in memory. An `import_runs` history where failed
attempts simply don't exist would hide exactly the information a reviewer
(or a real customer) would want: "someone tried to import X and here's
specifically why it didn't work." This costs nothing in terms of atomicity
risk — a failure-path `import_runs` insert never has a template attached to
it (`template_id` is null), so it can't ever represent a half-imported
template.

---

### D9 — Four honest statuses, never a blended trust score

**Decision**: The Import Integrity Engine (`src/lib/integrity/`) reports one
of exactly four discrete statuses — `verified`, `verified_with_warnings`,
`review_required`, `failed` — plus the raw counts and mismatch lists behind
that status. It never computes or surfaces a percentage, a weighted score,
or any single blended number standing in for "how good was this import."

**Alternatives considered**: A 0–100 "confidence score" (e.g. weighting
structure match, text match, and coverage into one number, "Import quality:
98%"); a simple pass/fail boolean.

**Why**: Explicit instruction for this phase ("DO NOT create a vague or
arbitrary '98% score'"), and it follows directly from this product's whole
premise. A score answers "should I feel good about this?" — a question that
invites trusting the number instead of the data. It also necessarily hides
information: is 98% three formatting warnings on an otherwise perfect
561-row import, or one entire section's 12 comments that silently failed to
persist? Those are wildly different situations a customer needs to react to
differently, and a single score collapses them into the same digit. A
boolean pass/fail is honest but too coarse in the other direction — it can't
distinguish "verified, zero caveats" from "verified, but three links had to
be dropped as unsafe," both of which are real, different outcomes a reviewer
should be able to tell apart at a glance. Four statuses, each tied to a
specific, inspectable reason (the counts and mismatch lists in the same
`IntegrityResult`), is the smallest vocabulary that stays honest.

**A note on `unaccountedRows`**: this is the one number in the whole system
treated as a hard boundary rather than a fuzzy signal — greater than zero is
always `review_required` regardless of how good every other metric looks,
because it means the engine found at least one meaningful source row it
cannot explain the fate of. That is precisely the "silent data loss" this
whole assessment is about preventing, so it gets veto power over the
computed status, not just a vote.

---

### D10 — A duplicate gets lineage, not a fabricated import run

**Decision**: `duplicate_template` copies `templates`, `sections`, `items`
and `comments`, and deliberately does **not** copy or synthesize
`import_runs` / `import_issues`. A duplicate therefore has no integrity
status of its own. Its provenance is `templates.parent_template_id` plus the
`source_sheet` / `source_row_number` already carried on every copied row.

**Alternatives considered**: Copying the source template's import run and
issues so the copy looks "complete" on the dashboard; or synthesizing a new
import run describing the duplication event.

**Why**: An import run is a record that a specific file was validated,
parsed, persisted and integrity-checked. None of that happened for a
duplicate — no file was read, no rows were reconciled. Giving a copy an
import run (inherited or invented) would put a "Verified" badge on something
this system never verified, which is the exact species of dishonesty the
integrity engine exists to prevent (D9). The dashboard instead shows copies a
"Copy" lineage badge and no import-report link, because there genuinely is no
report to link to.

The per-row `source_sheet`/`source_row_number` values *are* carried over,
because unlike an import run they remain true statements: that comment really
did originate at that row of that sheet, whichever template row now holds it.

**Consequence handled**: dashboard counts previously came from the import
run's stored counts, which a duplicate doesn't have (it would have rendered
as "0 sections, 0 items, 0 comments"). `listTemplateSummaries` now counts the
actual rows instead — also more truthful now that editing exists, since
import-time counts are a snapshot rather than current state.

---

### D11 — Independence is verified after the copy, not assumed

**Decision**: After `duplicate_template` commits, the service re-reads both
the original and the copy and runs `verifyDuplicateIndependence` — content
must match, and the two templates' row-id sets must be disjoint. The result
is surfaced to the user; a copy that fails verification is reported as such
rather than being announced as a clean success.

**Alternatives considered**: Trusting the SQL (it uses `gen_random_uuid()`
defaults, so fresh ids are structurally guaranteed); or deleting the copy
automatically if verification fails.

**Why**: The trust argument is the same one the import pipeline makes — the
write being *designed* to be correct isn't the same as *observing* that it
was. Disjoint ids are the entire basis for "editing the copy can't change the
original" (every write here is keyed by row id), so it's worth one cheap
check rather than an assumption. Making it a pure function also means the
guarantee is unit-testable without a database, which matters because this
project's live-DB tests are blocked (requirements-matrix row 13).

Auto-deleting on failure was rejected: the copy is already committed, a
failure would indicate a serious bug worth inspecting, and silently
destroying rows to tidy up is exactly the kind of unasked-for destructive
action this codebase avoids. It's reported instead.
