# AI development workflow

This assessment explicitly said reusable prompts, agent setups, and scripts
are of interest to reviewers. This document is that disclosure: how this
project was actually built, not a sanitized summary of it.

## Tool

[Claude Code](https://claude.com/claude-code) was used throughout, working
directly in this repository under my own direction. `ENGINEERING.md` at the repo
root is the governing document every session was required to read first —
it's the actual engineering constitution this project operated under, not
a README written after the fact to look organized. It states the
non-negotiables (deterministic import core, no AI in the parsing path,
structured model not an HTML blob, never fabricate a percentage, never
pretend a sample export exists that doesn't) and is kept up to date with
the repository's real current state, including its real current blockers.

## Phased prompting strategy

Work happened as a sequence of explicitly-scoped phases, each given as its
own prompt, each expected to reach a working, tested state before the next
one started. This wasn't incidental — `docs/work-plan.md` laid out the
intended phase boundaries before any code was written, specifically so a
later phase's correctness was never resting on an earlier phase's unverified
assumption. Roughly, in the order they actually happened:

1. Governance & documentation scaffold (`ENGINEERING.md`, `docs/architecture.md`,
   `docs/decision-log.md`, `docs/requirements-matrix.md`) — before any
   application code.
2. Application foundation (Next.js, TypeScript, Tailwind, design system).
3. Spectora format research and the canonical data model — with an explicit
   instruction not to fabricate a real sample export if none existed, and
   to search the repo and say so plainly if it didn't (it didn't; still
   doesn't — see `docs/requirements-matrix.md` row 16).
4. The deterministic parser, with a standing rule that no phase after this
   one was allowed to introduce an LLM into the import path.
5. Atomic Supabase persistence.
6. The deterministic Import Integrity Engine — the product's actual
   differentiator, and explicitly required to never produce a fabricated
   score or percentage.
7. Dashboard and import workflow UI.
8. Import Report and Issue Review UI, with an explicit requirement to
   distinguish "not present in source" from "present but unsupported."
9. The template editor, with a requirement that a failed save never
   silently discard the person's edit.
10. Independent template duplication, with a requirement to prove
    independence rather than assume it from the write logic alone.
11. A reliability and security hardening pass — ten named failure cases,
    a centralized typed error model, upload validation hardening.
12. The optional AI Import Auditor — deliberately the *last* feature phase,
    built only once every requirement above was already demonstrated
    working without it, with hard architectural constraints on what it
    could see and do (§7 of `docs/architecture.md`).
13. A dedicated QA pass — auditing the parser specifically for hidden
    assumptions tied to the one sample it had been tested against.
14. A product-design polish pass across every screen.
15. Reviewer-readiness: a real seeding pipeline and deployment preparation.
16. This documentation pass.

Each phase's prompt stated its scope, its hard constraints (often carried
forward verbatim from `ENGINEERING.md`), and ended with an instruction to run the
verification gate and report back — not to just report "done."

## Human verification

Every phase closed with the same four commands, non-negotiably:

```bash
npm test        # Vitest
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build       # Next.js production build
```

A phase wasn't reported as complete until all four passed. This wasn't a
formality — it caught real regressions mid-session more than once (a test
whose expected value needed updating after a genuine behavior change; a
`.eq()` mock signature that didn't match the real two-argument call; a
route test broken by a deliberate size-limit change). Every regression it
caught was fixed before moving on, not deferred.

Beyond the automated gate, several phases were checked with **real
execution**, not just code review, because several real bugs were only
findable that way:

- **A temporary, interactive Playwright browser session** against mock data
  during the editor phase (installed, used, uninstalled — not part of the
  committed suite, since it needed state the automated suite doesn't have)
  found two genuine bugs: a save-status indicator that could silently
  desync from the actual field state after certain re-renders, and a Server
  Action whose thrown error left the UI stuck on "Saving…" forever instead
  of resolving to "Save failed."
- **Small standalone probe scripts**, run directly against the parser
  rather than reasoned about, found the two worst bugs in this codebase
  during the QA pass: a multi-sheet workbook silently lost every sheet
  after the first, with zero issues raised (the parser's own drop-detection
  mechanism failing to notice its own drop); and a header like "Item Text"
  could be claimed by two column roles simultaneously, duplicating every
  item name into a spurious comment. Both were confirmed with a real probe
  before being called bugs, fixed, and pinned with regression tests.
- **External facts were verified against current documentation, not assumed
  from training data**, when the claim mattered. The deployment-prep phase
  specifically checked Vercel's actual current request-body limit against
  Vercel's own docs rather than trusting a remembered number — and that
  check found a real, previously-undetected bug (this app advertised
  uploads "up to 20MB"; Vercel hard-caps every request at 4.5MB on every
  plan). See `docs/decision-log.md` D15.

## AI did not substitute for understanding

A few things this project held to throughout, deliberately, because using
an AI tool to write code is not the same thing as understanding what the
code needs to do:

- **Every non-obvious decision has a written "why," not just a "what."**
  `docs/decision-log.md` has fifteen entries, each stating the alternatives
  considered and specifically why they were rejected — not because a
  template demanded it, but because a decision without a stated reason is
  one nobody, including me, can later tell was actually reasoned through
  versus merely generated.
- **Claims were checked against reality before being trusted**, repeatedly,
  across this whole project — real headless-browser sessions instead of
  assuming UI code works from reading it; standalone probe scripts instead
  of assuming parser logic is correct from reading it; current platform
  documentation instead of assuming a remembered Vercel limit is still
  accurate. Several real defects in this codebase exist specifically
  because something was checked instead of trusted.
- **Every fabrication-adjacent instinct was explicitly refused.** No
  synthetic file is presented as the real Spectora sample. No integrity
  score is a percentage (`docs/decision-log.md` D9 states exactly why a
  blended trust score was rejected as a category, not just avoided this
  time). No "not present in source" claim is made without an exact-row
  match as evidence. No demo data is seeded silently in place of a missing
  real file — `npm run seed` refuses and explains itself instead.
  `NOTES.md`'s "Known limitations" section says plainly what's still
  unverified, including the single largest limitation of this entire
  submission (no real Spectora export has ever been parsed by this system).
- **Scope stayed bounded to what was asked.** `ENGINEERING.md` §4 explicitly
  prohibits speculative scope expansion, and it held — no inspection
  scheduling, no payments, no homeowner portal, nothing beyond what the
  assessment actually asked for (`NOTES.md` "What I cut and why" has the
  full list). The AI Auditor specifically — the one place a model call
  could plausibly have been more deeply integrated — was instead
  deliberately constrained down to an explanatory layer with no decision
  authority, because that boundary was a requirement, not a default.

## Reusable artifacts

- **`ENGINEERING.md`** — kept, not archived. It's the actual document every
  phase of this project operated under, and it still reflects this
  project's real current state (including real current blockers), not a
  snapshot from early in development.
- **`.claude/commands/verify-assessment.md`** — a Claude Code slash command
  (`/verify-assessment`) that runs this project's own verification gate
  (tests, lint, typecheck, build) and checks the state of the requirements
  matrix and the known blockers, so re-verifying "is this actually still
  in the state the docs claim" is one command, not a manual walk through
  five different files.
