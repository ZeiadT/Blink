# Next Task Plan: Durable Campaign Runner

## Goal

Make campaign execution safe across pause, resume, side-panel closure, and
Manifest V3 service-worker suspension. Background owns execution; UI sends
commands and renders persisted status.

## Scope

- `src/background/orchestrator.ts`
- `src/background/scheduler.ts`
- `src/background/index.ts`
- `src/background/storage.ts`
- `src/shared/types.ts`
- `src/shared/messages.ts`
- `src/sidepanel/store/campaignStore.ts`
- Campaign runner and status tests

## Design

1. Persist campaign state after every atomic transition.
2. Store next pending target index, target results, run token, and scheduled
   continuation time in active campaign state.
3. Use a named `chrome.alarms` alarm to resume a delayed run.
4. Check run token and status before every target; stale loops exit.
5. Pause records `paused` immediately. Current post may finish; no next target
   starts.
6. Resume only starts when state is paused and no matching run owns execution.
7. Recovery restores persisted state and lets the matching alarm continue it.
8. Use one typed status response shape for background-to-side-panel reads.

## Migration and compatibility

- Keep existing campaign records readable.
- Derive a safe next target from stored results when legacy index is ambiguous.
- Preserve completed/failed/skipped results and campaign target snapshots.
- Fail closed on invalid active state; show actionable UI error.

## Tests

- Pause after first success never posts next target.
- Resume posts only pending targets.
- Repeated resume creates one execution loop.
- Stale alarm/run token cannot post.
- Paused campaign restores after new orchestrator instance.
- Delayed run survives alarm wake path.
- Side panel hydrates current paused/running state.

## Manual verification

1. Start a three-group campaign with a visible delay.
2. Pause after first result; wait past delay; confirm no second post.
3. Close and reopen side panel; confirm paused state.
4. Resume; confirm only remaining groups post once.
5. Reload extension during delay; confirm persisted state restores and no duplicate
   post occurs.

## Exit criteria

- No duplicate post after pause/resume or recovery.
- One execution owner per campaign run.
- No campaign loop relies on service-worker-local timer survival.
- Type-check, lint, all tests, and production build pass.
