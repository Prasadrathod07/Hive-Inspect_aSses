# Pre-recording checklist

Run through this immediately before recording `docs/walkthrough.md` — not
the day before. State drifts (someone re-seeds, an env var changes, a
browser tab has an old session in it), and a live demo is the worst place
to discover that.

## Database seeded

- [ ] `curl https://<your-live-url>/api/health` returns
      `{"status":"ok","checks":{"supabaseConfigured":true,"supabaseReachable":true}}`.
      If this fails, stop — nothing else on this list matters until it's
      fixed. See `docs/deployment.md` §6.
- [ ] The seeded template is real — confirm it came from `npm run seed`
      (the real Spectora export), **not** `npm run seed -- --allow-synthetic`.
      If the dashboard card's name says "SYNTHETIC DEMO" anywhere, this is
      the wrong data for a real recording — reset it (see "Demo reset"
      below) and reseed from the real file.
- [ ] Open `/` yourself, once, before recording. Confirm the template card
      shows a real integrity status badge (not "No integrity result") and
      real section/item/comment counts (not zero).

## AI behavior known

- [ ] Know, for certain, whether `AI_AUDITOR_ENABLED` is `true` or `false`
      on this deployment right now — don't guess. Open the Import Report
      once and look at the "AI Import Review" section yourself.
- [ ] If it's **enabled**: trigger it once before recording so you know what
      a real response looks like and roughly how long it takes to resolve
      (the section shows a loading spinner while it's in flight — know
      whether that's instant or takes several seconds, so you're not
      surprised on camera).
- [ ] If it's **disabled**: confirm the fallback line reads exactly *"AI
      review is unavailable. Your deterministic import integrity report is
      unaffected."* — that's what §7 of the walkthrough quotes. If the
      wording has changed, update the walkthrough script, not the checklist.
- [ ] Either way, decide in advance whether you're demoing this section live
      or just describing it — don't decide live on camera.

## File ready

- [ ] The **real Spectora export** used to seed the demo template
      (`sample-data/spectora/<filename>.xlsx`) is also saved somewhere you
      can reach instantly during recording (desktop, pinned folder) — for
      §3's "import" step, if you're demonstrating the import flow live
      rather than only showing the already-seeded result.
- [ ] Confirm its file size — should be comfortably under 4MB (Vercel's
      platform limit, `docs/decision-log.md` D15). If it's close to the
      limit, know that before recording, not after an on-camera 413.

## Copy name ready

- [ ] Know what name you'll type into the "Name for the copy" field before
      you're on camera — don't improvise it live. Something short and
      obviously a demo artifact (e.g. the auto-proposed "`<name>` — Copy" is
      fine as-is; you don't need to overthink this).
- [ ] Confirm you know the *original* template's exact current name and
      field values going in, so when you reopen it at the end of §3 you can
      say with confidence "still says X" instead of squinting at the screen.

## Failure file ready

- [ ] Have the failure-case file (§9) ready **before** recording — a real
      non-spreadsheet file (a `.txt`, a `.pdf`, anything) renamed so its
      filename ends in `.xlsx`. Confirm it's actually not a valid
      spreadsheet (don't accidentally rename a real `.xlsx` and have it
      import successfully on camera).
- [ ] Do a silent dry run of the upload once before recording, so you know
      the exact message that appears and don't have to read it cold on
      camera.

## Browser clean

- [ ] Use a fresh incognito/private window, or a browser profile with no
      relevant history/autofill/extensions visible in the chrome.
- [ ] Close every other tab. Turn off notification popups (email, chat,
      OS-level) for the recording window.
- [ ] Zoom/font size set to something legible on the final video — test
      this by watching back 10 seconds of a practice recording, not by
      eyeballing your own screen.
- [ ] No dev-only browser extensions or a visible bookmarks bar full of
      internal tools.

## Live URL works

- [ ] The URL you're about to say out loud or show on screen is the actual
      final one from `README.md` §4 — not a preview/branch deployment URL
      that will 404 after you merge.
- [ ] Click through the whole §3 sequence **once**, silently, immediately
      before recording — dashboard → import (if demoing live) → report →
      issue → editor → edit → save → refresh → duplicate → edit → reopen
      original. If anything is slower or different than the script assumes,
      you want to know now, not mid-take.

## No secrets visible

- [ ] View source (or open dev tools → Network) on the live URL and confirm
      no service-role key, connection string, or API key appears anywhere —
      this should already be true (verified in `docs/deployment.md`), but
      confirm it yourself once, since this is about to be shown to a live
      audience.
- [ ] Check your browser's address bar / any open tabs for anything you
      wouldn't want visible on a shared screen (other projects, personal
      accounts, unrelated credentials).
- [ ] If recording your terminal at any point (e.g. running `npm run seed`
      on camera), confirm `.env` isn't visible in a file tree panel and
      isn't accidentally `cat`'d or opened in an editor tab in frame.

## Demo reset performed if needed

- [ ] If you rehearsed the full click-through (editing the seeded template,
      creating a test duplicate) and want a clean starting state for the
      real recording: `npm run seed -- --reset` deletes only this script's
      own seeded run/template (scoped by content hash — never a blanket
      wipe, `docs/decision-log.md` D14), then `npm run seed` reseeds fresh
      from the real export.
- [ ] After resetting, confirm the reseed actually landed — re-check
      `/api/health` and reopen `/` once before recording, per "Database
      seeded" above. Don't assume a reset+reseed succeeded without looking.
- [ ] If you created any extra duplicates during rehearsal that you don't
      want visible on the dashboard during recording, delete them manually
      (there's no bulk-cleanup command for reviewer-made duplicates by
      design — see `docs/decision-log.md` D14 on why reset stays narrowly
      scoped).
