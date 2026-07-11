# Phase 5 Verification

## Automated record

- `npm test -- --reporter=dot` — 23 files, 287 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed; Vite only reports existing CRX `rollupOptions`/`rolldownOptions` warning.

## Regression matrix

| Delivered flow | Automated coverage |
| --- | --- |
| Campaign target snapshots and durable pause/resume | `campaignStore`, `durableCampaignRunner`, `orchestrator` unit tests |
| Named groups and CSV/TXT import | `groupCatalog`, `groupImport`, `groupStore`, and GroupManager tests |
| Saved-post library and multiline transport | `postLibrary`, `postStore`, composer, PostComposer, and content-composer tests |
| Delay policy and controls | `timingPolicy`, `settingsStore`, scheduler, and Settings tests |
| History, terminal status, and user-facing errors | storage, messages, campaignStore, orchestrator, durable-runner, and CampaignHistory tests |

## Non-live Chrome checklist

1. Run `npm run build`.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, then select `dist`.
3. Open Blink side panel. Confirm Groups, Compose, Campaign, and Settings load with no console errors.
4. Add a named group, edit its name, and import CSV/TXT containing valid, duplicate, and invalid entries. Confirm preview counts and errors.
5. Create, edit, duplicate, select, and delete reusable posts. Confirm campaign-only edits do not change saved post content.
6. Enter text with empty lines, Arabic, emoji, and CRLF line endings. Confirm composer preview and saved-post reload preserve every line break.
7. Change timing steppers at both bounds. Confirm five-second steps, disabled bound controls, reload persistence, and unchanged active-campaign timing snapshot.
8. Open Campaign. Confirm stored terminal records appear in **Recent runs** only after **New Campaign** dismisses active result.
9. Expand a history row using keyboard. Confirm multiline text, result URLs, Facebook errors, counts, settings, and status rail remain readable.
10. Reload extension with a paused campaign and with a terminal campaign. Confirm no duplicate target post is scheduled and terminal record remains one history entry.

## Authenticated Facebook checklist — user-run only

Use a private test group. Confirm membership and posting permission first.

1. Start a two-target campaign using a multiline post. Pause after first target; wait past delay; confirm second target does not post.
2. Close/reopen side panel, then resume. Confirm only pending target posts once.
3. Reload extension during delay, then confirm alarm recovery continues only pending target.
4. Force one target to fail (for example, remove posting permission). Confirm terminal state is **Completed with issues**, error appears in result and history, and successful target is not reposted.
5. Confirm campaign targets never appear in saved group catalog unless explicitly added or imported.

No live Facebook post was made during automated verification.
