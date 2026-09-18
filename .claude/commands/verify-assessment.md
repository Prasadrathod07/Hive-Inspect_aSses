---
description: Run this project's full verification gate and report real, current status against the assessment requirements — never a cached or assumed answer.
---

Run this project's actual verification gate and report the real, current
state of the assessment submission. Every claim in your report must come
from a command you just ran or a file you just read in this turn — never
from memory of a previous session, and never phrased more confidently than
the evidence supports.

## 1. Run the verification gate

Run these four, in order, and capture full output for each:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

If any fail, stop and report the failure plainly — do not continue to later
steps as if the gate passed. Fixing a failure found here is in scope; do not
suppress, skip, or silently work around a failing check.

## 2. Check the real blockers, not the last-known state

Read `docs/requirements-matrix.md` and report every row whose status is
`BLOCKED` or `TODO`, verbatim. Then check whether each blocker's underlying
condition has actually changed, by looking at real current state — don't
trust the matrix's prose if it's checkable directly:

- **Real Spectora export** (requirement 16): does `sample-data/spectora/`
  contain a real spreadsheet file now (anything other than `README.md` or
  the `synthetic/` subdirectory)? Check the directory directly.
- **Service role key** (requirement 13): is `SUPABASE_SERVICE_ROLE_KEY` set
  in `.env` (presence only — never print or log its value)?
- **Migrations applied**: this can only be confirmed by connecting to the
  live database (see `docs/db-verification.md`) — if you cannot reach it
  from this environment, say so plainly rather than guessing either way.
- **Live deployment**: is there a real URL in `README.md` §4, or is it
  still the placeholder? Check the file directly.
- **Demo seeded**: has `npm run seed` (no flags) ever succeeded, per
  `docs/requirements-matrix.md` row 15's own evidence column? Do not run
  `npm run seed` yourself as part of this check — it can seed real data,
  which is a decision for a human to make deliberately, not something a
  verification command does as a side effect.

## 3. Report

Give a direct, structured summary:

- **Gate**: pass/fail for each of the four commands, with the actual
  failure output if anything failed.
- **Blockers**: which requirements are genuinely still blocked right now,
  and specifically what would need to change to unblock each one — not a
  restatement of the matrix, an answer based on what you just checked.
- **Anything the matrix claims that you could not verify from here**: say
  so explicitly (e.g. "migrations status cannot be confirmed without
  database access").

Do not round up. "Deployment-ready but not deployed" and "deployed and
verified" are different claims — say which one is actually true right now.
