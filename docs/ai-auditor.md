# AI Import Auditor

> **AI failure can degrade explanation, but cannot corrupt migration.**

That sentence is the whole design. Everything below is the mechanism that makes
it true, and the reasoning for why it's built this way rather than some more
obvious way.

## What it is

A language model writes a plain-language explanation of the **deterministic**
Import Integrity report, for an inspector who doesn't want to read a table of
counts. It appears as an "AI Import Review" section on
`/templates/[templateId]/import-report`, underneath the real results.

## What it is not

It is not part of the migration. It does not parse the spreadsheet, decide what
was preserved, compute a count, set a status, or write a single row of template
data. The integrity engine (`src/lib/integrity/`) already answered all of those
questions deterministically, and had persisted its answer, before the model was
called.

If you removed this feature entirely, the product would lose a paragraph of
prose and nothing else.

## Why a migration tool can have an LLM in it at all

The honest objection to AI in a data-migration tool is that a model's mistake
becomes the customer's corrupted data. That objection is about *where* the model
sits, not about models. Here it sits strictly downstream of a completed,
verified, persisted result, reading it and describing it. The dangerous position
— between the source file and the database — is occupied by deterministic code
with golden-fixture tests, and this feature does not touch it.

## The four barriers

### 1. It runs after, and outside, the result it describes

The report page renders the full integrity result server-side. `AiImportReview`
is a client component that mounts afterwards and calls a Server Action. The
deterministic numbers are on screen before the model is contacted, and they do
not re-render when it answers. A slow or dead provider shows a spinner that
resolves to one sentence — it cannot delay, blank, or replace the report.

This is also why the AI section is deliberately placed *below* the metrics, not
above them.

### 2. It cannot see the customer's content

`buildAuditPayload` (`src/lib/ai/audit-payload.ts`) is a pure function, and the
only thing that ever reaches a provider. It sends counts, statuses, category
keys, severities, row numbers, issue ids, and description strings this
repository wrote itself. It does **not** send section names, item names, comment
text, raw snippets, per-issue explanations, or the source filename.

Per-issue `explanation` and `rawSnippet` are read — they're needed to classify
an issue into a display group — and then dropped. They are never copied into the
payload. `audit-payload.test.ts` plants distinctive strings (a fake homeowner
name and address) in every content-bearing field and asserts none of them appear
in the serialized payload.

This costs almost nothing: the thing being explained is a numeric and
categorical result, so the content adds no explanatory value. Sending it would
be pure risk for no benefit.

### 3. Its output is validated before anything is shown

`validateAuditOutput` (`src/lib/ai/audit-schema.ts`) applies two gates:

**Strict schema.** Five fields, exact types, `.strict()` so any additional key
fails the whole response. This is the mechanism — not a prompt instruction —
that rejects a model returning replacement template content, invented sections,
corrected counts, an integrity status of its own, or SQL to "fix" things. There
is no field through which such a thing could arrive. The prompt also forbids it,
but the prompt is the polite request; the schema is the enforcement.

Note what has no field: counts, status, pass/fail. The model is given no slot in
which to disagree with the deterministic engine.

**Issue-id allowlist.** Every id in `recommendedIssueIds` must be one that was
supplied in the payload. A fabricated id is rejected.

We reject the **entire response** on a bad id rather than filtering it out. A
model that invented an id has demonstrated it isn't tracking the data it was
given, which makes its prose untrustworthy too. Silently dropping the bad id
would hide exactly the signal we most want to act on.

### 4. It has no write path to template data

`runAiAudit` writes one row to `ai_audits` and nothing else.
`run-audit.test.ts` asserts that the only table touched is `ai_audits`.

The `ai_audits` table (`supabase/migrations/20260917000000_ai_audits.sql`) is a
leaf: it references `import_runs`, nothing references it, and it has no trigger
or function that writes anywhere. The safety property is structural — there is
no path *in the schema* by which an AI result could alter migrated content.

A response that failed validation is recorded with status `invalid_output` and
the reason, but its content is not stored as though it were usable.

## Failure behaviour

Every state degrades to one sentence. `runAiAudit` never throws.

| Situation | What the person sees |
|---|---|
| `AI_AUDITOR_ENABLED` isn't `true`, or no API key | "AI review is unavailable. Your deterministic import integrity report is unaffected." |
| Malformed output, or an invented issue id | "AI review could not be validated. No imported data was changed." |
| Provider error, HTTP failure, or timeout | "AI review could not be completed. Your deterministic import integrity report is unaffected." |

The operator gets the real reason in the server log and in
`ai_audits.failure_reason`. The browser never does — same rule as every other
failure in this app (`docs/decision-log.md` D12).

**Unconfigured is a supported configuration, not a broken one.** A fresh
checkout with no AI keys runs the complete assessment: import, editing,
duplication, persistence, integrity reporting. `requestAiAudit` checks for a
provider before it touches the database, so the disabled path doesn't even
require Supabase.

## Configuration

```bash
AI_AUDITOR_ENABLED=true          # must be exactly "true"; anything else disables
AI_AUDITOR_MODEL=claude-sonnet-5 # optional; default depends on which provider shape below is used
AI_AUDITOR_TIMEOUT_MS=20000      # optional

# Provider shape 1: call Anthropic directly
ANTHROPIC_API_KEY=sk-ant-...     # server-only, never NEXT_PUBLIC_

# Provider shape 2: call an OpenAI-compatible endpoint instead (e.g. a
# self-hosted LiteLLM proxy). Both must be set for this shape to take
# effect; if they are, they take priority over ANTHROPIC_API_KEY.
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://your-litellm-proxy.example.com/v1/
```

Verified against a real production build: no AI key, endpoint, header name, or
system prompt appears anywhere in `.next/static`. `src/lib/ai/provider.ts` and
`run-audit.ts` both import `server-only`, so an accidental client import fails
the build rather than shipping a key.

## Provider architecture

`AiProvider` (`src/lib/ai/provider.ts`) is the seam: a payload in, raw text out.

Everything that matters for safety — what may be sent, what shape may come back,
which ids are real — lives on our side of that interface. A provider is
therefore swappable without touching a single validation rule, and
`run-audit.test.ts` exercises the entire pipeline through a mock provider with
no network.

Two implementations exist, both `fetch`, no SDK: one calls the Anthropic
Messages API directly, the other calls any OpenAI-compatible chat completions
endpoint (e.g. a self-hosted LiteLLM proxy), so a deployment can route model
access through its own gateway instead of calling a provider directly.
`resolveProvider` picks whichever is configured (`OPENAI_API_KEY` +
`OPENAI_BASE_URL` take priority if both are set); either way it's one HTTP
request with a handful of fields, so a dependency would add install weight
and supply-chain surface without removing real complexity. See
`docs/decision-log.md` D13's addendum.

## Caching

A successful audit is reused for that import run rather than regenerated per
page view. The integrity result it explains is immutable once computed, so
re-calling would spend money to re-derive the same explanation — and would make
the wording flicker between visits. Stored output is re-validated on read, so
even a hand-edited database row can't reach the UI.

## Tests

`src/lib/ai/` — 50 tests, no network, no database:

- **`audit-payload.test.ts`** — the privacy boundary: planted content strings
  must not appear in the payload; per-issue keys are exactly the five permitted
  ones; deterministic counts pass through faithfully.
- **`audit-schema.test.ts`** — valid responses accepted; replacement content,
  restated counts, SQL, invented statuses, extra keys, wrong types, empty
  summaries and non-objects all rejected; invented ids rejected; fenced JSON
  parsed.
- **`run-audit.test.ts`** — valid response, malformed response, invented issue
  id, provider error, provider timeout (asserts the abort actually fires),
  disabled, audit-write failure, and the invariants: never throws whatever the
  provider does, never mutates the integrity result, only ever writes to
  `ai_audits`.

## What this deliberately doesn't do

- No AI-suggested edits to template content. That would need a write path, and
  a write path is the thing this design exists to not have.
- No AI parsing or re-parsing of the spreadsheet.
- No AI-computed counts, statuses, or confidence scores. The integrity engine
  reports four discrete statuses and never a score (`docs/decision-log.md` D9);
  giving a model a numeric output field would reintroduce exactly the false
  precision that decision rejected.
- No streaming. The output is short and is validated as a whole before any of it
  is shown — streaming would mean rendering text that hasn't passed validation
  yet.
