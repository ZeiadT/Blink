# Remaining Blink Improvements

Candidate 1 — campaign target snapshots — is complete. New campaigns do not
write temporary targets into saved-group storage.

## 1. Durable campaign runner

- Persist the next unprocessed target, result states, run token, and next run
  time.
- Make background execution the sole owner; side panel only sends commands.
- Drive delayed continuation with `chrome.alarms`, not a worker-local timer.
- Make pause idempotent, finish the current atomic post safely, then stop.
- Make resume idempotent and continue only pending targets.
- Restore active and paused campaigns after worker suspension/reload.
- Return one consistent status response to the side panel.
- Add no-repost, repeated-resume, worker-recovery, and pause-during-delay tests.

## 2. Group catalog, custom names, and import

- Replace URL-only identity with normalized Facebook group ID plus display name.
- Migrate legacy `{ url, label? }` data without losing existing groups.
- Add manual group name edit and ID-based duplicate detection.
- Add CSV/TXT select/drop import, bounded file and row limits, preview,
  valid/duplicate/invalid counts, row reasons, confirm, and cancel.
- Reuse shared UI modules for concise errors and add membership-permission info.
- Test URL/ID normalization, headers, all separators, invalid rows, and storage
  failure feedback.

## 3. Saved-post library and multiline fidelity

- Split reusable saved posts from campaign draft state.
- Migrate the existing single `blink_post_draft` record into saved-post
  storage without data loss.
- Add title, create, select, edit, duplicate, delete confirmation, empty state,
  and newest-updated order.
- Copy a saved post into campaign state; campaign edits must not mutate it.
- Preserve text unchanged in storage/messages; normalize CRLF only at Facebook
  composer insertion.
- Test empty lines, paragraphs, Arabic, emoji, CRLF, and campaign resume.

## 4. Delay policy and settings UI

- Preserve current min/max range schema.
- Replace free typing with accessible min/max ±5-second steppers.
- Centralize finite bounds, step normalization, legacy-value normalization, and
  scheduler validation.
- Disable controls at bounds and keep running campaign settings snapshotted.
- Test invalid values, bounds, persistence, and scheduler use.

## 5. Cross-cutting completion work

> Automated validation passed on 2026-07-11 (`npm test`, `npm run lint`, and
> `npm run build`). Chrome non-live and authenticated Facebook verification
> steps are recorded in `docs/phase-5-verification.md`; do not mark this phase
> complete until those manual checks finish.

- Add campaign-history storage separate from active campaign.
- Use requested completed-with-issues status where appropriate.
- Surface storage, migration, invalid-state, Facebook, pause, and resume errors
  in the UI.
- Complete full-flow tests and Chrome extension manual verification for each
  delivered candidate.
