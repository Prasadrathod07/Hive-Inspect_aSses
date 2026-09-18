# Walkthrough script

**Target: 8–10 minutes. Never exceed 12.**

The section budgets below sum to **10:15** — realistic if you narrate every
beat in §3's demo table in full. That's over the 10-minute target and
comfortably under the 12-minute hard ceiling (1:45 of slack). Trim guidance
is at the bottom: cutting ~75–90 seconds from §3 and §8 (the two sections
with the most optional detail) brings it to ~9:00, comfortably inside the
target range.

**What this document is**: a script for the presenter (you), grounded in
functionality that exists in this repository right now and is covered by
its automated tests — never invented for the video. It is not a record of a
demo that has already been performed. Every UI flow described in §3 mirrors
`tests/e2e/migration-workflow.spec.ts` step for step, which is the actual,
passing test for this exact sequence — but that test is currently
skip-gated behind a live database (`docs/requirements-matrix.md` row 13),
so **this script assumes the outstanding blockers are resolved before you
record**: a real Spectora export seeded via `npm run seed`, and a live,
reachable deployment (or a fully-configured local environment). See
`docs/demo-checklist.md` before you sit down to record.

---

## 1. Intro — 0:30

**`<!-- TODO: your own personal introduction — who you are, and a one-line framing of what you're about to show. Not written for you; this is the one section that should sound like you, not documentation. -->`**

## 2. Customer problem — 0:35

> "An inspection company is migrating from Spectora to new software. Their
> template isn't a blank form — it's years of tuned language: which
> sections exist, which items get checked, the exact boilerplate comment
> wording an inspector has refined across hundreds of real jobs. That
> knowledge lives *in* the template. They will not manually recreate it.
>
> So this isn't a file-upload problem. Uploading a spreadsheet is the easy
> part. The actual problem is **migration integrity**: proving that what
> comes out the other side is what went in — every section, every item,
> every word of every comment, in the right order — and being honest, not
> vague, about anything that couldn't be carried across faithfully."

## 3. Live product demo — 4:30

Narrate briefly at each step; let the screen carry most of the time.

| Time | Step | What to show / say |
|---|---|---|
| 0:00–0:15 | Dashboard | Open the seeded template's card. Point at the integrity status badge and the section/item/comment counts — real numbers, read from Postgres. |
| 0:15–1:15 | Import | Go to `/import`. Show the "What we support" copy, then drag in the real Spectora export. Narrate while it processes: "one atomic write — the whole template commits, or none of it does." Land on the Import Report. |
| 1:15–1:50 | Import Integrity report | Point at the preservation banner — the literal phrase, e.g. *"0 unaccounted source rows"* — before anything else. Say plainly: "never a percentage, never an invented score — this is a real re-read of what Postgres actually has, reconciled against what was parsed." |
| 1:50–2:15 | One issue/warning | Scroll to "Issues for review." Open one real issue — a formatting change or an unsupported row, whichever this actual import produced. Show the raw source snippet retained alongside the explanation: "present in source, unsupported by this importer — never silently dropped, never claimed as missing." |
| 2:15–2:35 | Open template | Click **Open**. Show the hierarchy tree with section/item counts. |
| 2:35–3:00 | Edit + save | Click a section name field, retype it, watch the status go Unsaved → Saving… → Saved ✓. Click into an item name and a comment too, briefly — this is a real Server Action write, not local state. |
| 3:00–3:15 | Prove persistence | **Refresh the page.** The edit is still there — a fresh server render reading Postgres, not a cached client value. |
| 3:15–3:35 | Duplicate | Click **Duplicate**, accept or edit the proposed "[Name] — Copy" name, confirm. Land on the new template. |
| 3:35–3:55 | Edit the duplicate | Change the same field on the copy to something obviously different. Save. |
| 3:55–4:20 | Reopen original, prove independence | Navigate back to the *original* template. Point at the field: still shows your earlier edit, **not** the duplicate's edit. Say it directly: "these share zero rows — every write in this app is keyed by row id, so this isn't a convention I'm hoping holds, it's structurally impossible for one to reach the other." |
| 4:20–4:30 | (buffer) | — |

## 4. Repo / architecture — 0:30

> "Next.js on Node — App Router, Server Actions, one small API route for the
> actual file upload. Supabase Postgres as the real backend, not a mock.
> The important architectural line is the separation: a **deterministic
> parser** with zero model calls anywhere in it turns the spreadsheet into
> a structured model; a **separate, deterministic integrity engine**
> re-reads what Postgres actually persisted and checks it against that
> parse; and an **optional AI layer** sits downstream of both, only
> explaining a result that already exists. Those are three separate
> modules on purpose — `src/lib/import/`, `src/lib/integrity/`,
> `src/lib/ai/` — so a failure or a limitation in one can never reach into
> another."

## 5. Data model — 0:20

> "Template → Sections → Items → Comments — a real relational structure
> with stable IDs and explicit order, never one HTML blob. Every section,
> item, and comment carries its own source sheet and row number inline, so
> any node in this tree can answer 'where did this come from' on its own —
> that traceability is what makes the integrity engine and the
> issue-review screen possible at all."

## 6. Preservation — 0:40

> "Every meaningful row in the source file ends up in exactly one of three
> buckets: mapped into the template, flagged unsupported with its raw text
> retained, or intentionally ignored with a specific, named reason. Nothing
> falls through a fourth, silent bucket — the counts are asserted to sum to
> the total, and it's a test, not a hope. For rich content: bold, italic,
> underline, links, and lists are preserved as real formatting. Anything
> outside that — a table, an image, an unrecognized tag — is stripped from
> the saved HTML but the surrounding plain text is kept, and the removal
> itself is recorded as an issue, never silently absorbed."

## 7. AI — 0:30

> "The AI Auditor only ever sees what the deterministic engine already
> computed — counts, statuses, category keys, issue IDs. It never sees the
> customer's actual section names, item names, or comment text, and its
> output schema has no field for a count or a status — there's no slot for
> it to disagree with the deterministic result, because that field simply
> doesn't exist. It can't corrupt the migration because it has no write
> path to any of that data at all."

Optionally, show the graceful-failure state live — this needs no model call
and is honest either way:

- If `AI_AUDITOR_ENABLED` is off for this deployment: scroll to "AI Import
  Review" and show the real fallback line — *"AI review is unavailable.
  Your deterministic import integrity report is unaffected."* — and say:
  "that's not a placeholder, that's the actual behavior with no AI key
  configured at all. The rest of this page doesn't care either way."
- If it's on: show a real explanation, then note there are two more honest
  fallback states behind it (*"could not be validated"* / *"could not be
  completed"*) that behave identically — the report above never waits on
  or depends on any of the three.

## 8. Hard part — 0:45

The real one — not the sanitizer, not file validation, both of which were
comparatively mechanical.

> "The hardest problem was reconstructing a hierarchy from a **flattened**
> spreadsheet with no known convention and no real sample to check against.
> A row's section and item might be blank — meaning 'same group as the row
> above' — or repeated on every row. We don't know which Spectora actually
> does, so the hierarchy builder has to tolerate both. And when the order
> genuinely doesn't tell you the answer — a comment shows up before any
> item has been established in a brand-new section — the only honest move
> is to *not guess*: flag it as ambiguous, keep the raw content, and let a
> human resolve it.
>
> That same category of problem produced the worst bug in this codebase: the
> parser used to stop at the first sheet with a recognizable header. A
> multi-sheet workbook had every sheet after the first silently dropped —
> zero issues raised, because the integrity engine's own row-count check
> was built from the same incomplete parse that dropped them. I only found
> it by actually running the parser against a two-sheet fixture, not by
> reading the code — fixed by parsing every sheet and feeding every sheet's
> rows into the same coverage count the integrity engine checks against."

## 9. Failure case — 0:35

> "One real, implemented case: take this exact file, rename it to end in
> `.xlsx`, but don't actually make it a spreadsheet — a text file, a PDF,
> anything. Upload it."

Do this live: upload a renamed non-spreadsheet at `/import`. Show the exact
message:

> *"`<filename>.xlsx` is named like a spreadsheet, but its contents aren't
> one. Re-export from Spectora rather than renaming a file."*

> "That's not a stack trace and it's not a generic 'upload failed' — it's a
> real magic-byte check on the file's actual bytes, not its name, giving a
> specific and honest reason. And the workspace stays usable — you can
> immediately drop in the real file without reloading the page."

## 10. Decisions / cuts — 0:25

> "Deliberately out of scope: writing an actual inspection report, job
> scheduling, payments, a homeowner-facing portal, a mobile app, and full
> parity with Spectora's own product. This migrates one specific export
> faithfully — it was never trying to be Spectora. And the biggest
> constraint I held throughout: zero AI anywhere in the decision path for
> what an import actually contains. The parser is 100% deterministic."

## 11. Hive product feedback — 0:20

**`<!-- TODO: this needs your own real observation about Hive's product — not something I can write for you without fabricating it. If you have a genuine take from using or researching Hive, say it here in one or two sentences. If you don't have one yet, cut this section rather than force one. -->`**

## 12. Binsr — 0:15

**`<!-- TODO: only include this if you actually explored Binsr. If you did, one sentence of real comparison goes here. If you didn't, say so directly on camera — "I didn't get to a hands-on Binsr comparison for this pass; NOTES.md says the same" — and move on. Do not improvise a comparison you don't actually have. -->`**

## 13. Close — 0:20

> "If I kept going, the next thing I'd build is exactly what's still
> missing, in order: get a real Spectora export through this pipeline and
> correct whatever assumptions turn out to be wrong — that's the single
> biggest open question this whole submission has. Then close the two
> untested paths that need a live database: the integration test suite and
> the full browser walkthrough. And on the AI side, I'd want to see it run
> against a real model instead of a mock, since right now its JSON-contract
> reliability in practice is the one thing I genuinely don't know."

---

## Timing summary

| Section | Budget |
|---|---|
| 1. Intro | 0:30 |
| 2. Customer problem | 0:35 |
| 3. Live demo | 4:30 |
| 4. Repo / architecture | 0:30 |
| 5. Data model | 0:20 |
| 6. Preservation | 0:40 |
| 7. AI | 0:30 |
| 8. Hard part | 0:45 |
| 9. Failure case | 0:35 |
| 10. Decisions / cuts | 0:25 |
| 11. Hive feedback | 0:20 |
| 12. Binsr | 0:15 |
| 13. Close | 0:20 |
| **Total** | **10:15** |

If you're running long, cut in this order — each is safe to trim without
losing anything substantive:

1. **§3, "Edit the duplicate" + "Reopen original" (3:35–4:20, 45s)**: narrate
   over the clicks in one breath instead of two separate beats. Saves ~20s.
2. **§8's bug story** (the second paragraph): keep only the design-problem
   paragraph, drop the multi-sheet bug narrative. Saves ~20–25s.
3. **§6**: drop the second sentence about rich content specifics, since §12
   of `docs/spectora-format.md` covers it in writing for anyone who wants
   the detail. Saves ~10–15s.

Cutting all three brings the total to roughly **9:10** — inside the target
range with real margin under the 12-minute ceiling.
