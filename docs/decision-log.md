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
