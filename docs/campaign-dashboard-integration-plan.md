# Checkpoint 6 — Campaign Dashboard, Integration & Polish

Full E2E flow: compose → groups → start campaign → live progress → view results. Premium UI with glassmorphism, animations, real-time status.

## User Review Required

> [!IMPORTANT]
> Original plan references `src/popup/` paths — codebase uses `src/sidepanel/`. All CP6 files go under `src/sidepanel/`.

> [!IMPORTANT]
> `Modal.tsx` and `Toast.tsx` from CP3 spec were never built. They're needed by CP6 (campaign errors, confirmations, save-list flow). Plan includes them.

## Open Questions

> [!IMPORTANT]
> **Settings persistence**: Settings currently have no store or storage key. Plan adds a `settingsStore.ts` that reads/writes `STORAGE_KEYS.SETTINGS`. This means settings round-trip through `chrome.storage.local` — same pattern as postStore/groupStore. OK?

> [!IMPORTANT]
> **Campaign status polling vs push**: The orchestrator broadcasts via `chrome.runtime.sendMessage`, but side panel also needs to poll on mount (campaign may have started before panel opened). Plan uses both: `chrome.storage.onChanged` listener + initial `GET_CAMPAIGN_STATUS` message on mount. Acceptable?

> [!IMPORTANT]
> **E2E test scope**: Playwright with real Chrome extension loading is complex. Plan includes a basic extension-load + UI-interaction test. Full posting flow requires a real FB session — that stays manual. OK to scope E2E to UI-only?

---

## Proposed Changes

### Shared Components (Modal + Toast)

These were spec'd in CP3 but never created. Multiple CP6 components need them.

#### [NEW] [Modal.tsx](file:///c:/Business/Blink/src/sidepanel/components/shared/Modal.tsx) + [Modal.module.css](file:///c:/Business/Blink/src/sidepanel/components/shared/Modal.module.css)
- Portal-based modal with backdrop blur + slide-up animation
- Props: `isOpen`, `onClose`, `title`, `children`
- Keyboard: Escape to close, focus trap
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`

#### [NEW] [Toast.tsx](file:///c:/Business/Blink/src/sidepanel/components/shared/Toast.tsx) + [Toast.module.css](file:///c:/Business/Blink/src/sidepanel/components/shared/Toast.module.css)
- Toast notification system using React context + portal
- Variants: `success`, `error`, `info`, `warning` with Lucide icons (CheckCircle, AlertCircle, Info, AlertTriangle)
- Auto-dismiss (configurable, default 4s), stacked positioning
- `useToast()` hook returns `{ toast }` with `toast.success(msg)`, `toast.error(msg)`, etc.
- Follows `rerender-no-inline-components` rule — Toast items are standalone components

---

### Campaign Store + Hooks

#### [NEW] [campaignStore.ts](file:///c:/Business/Blink/src/sidepanel/store/campaignStore.ts)
- Zustand store: `campaign: Campaign | null`, `isLoading: boolean`
- Actions: `startCampaign`, `pauseCampaign`, `resumeCampaign`, `cancelCampaign`, `refreshStatus`
- Each action sends typed message to background via `chrome.runtime.sendMessage`
- Listens to `chrome.storage.onChanged` for real-time campaign state updates from service worker
- On init: sends `GET_CAMPAIGN_STATUS` to get current state
- Derived selectors: `isIdle`, `isRunning`, `isPaused`, `isCompleted`, `progress` (0-1), `successCount`, `failedCount`, `skippedCount`
- Follows `rerender-derived-state` — expose primitive booleans, not raw Campaign object where possible

#### [NEW] [settingsStore.ts](file:///c:/Business/Blink/src/sidepanel/store/settingsStore.ts)
- Zustand store: `settings: CampaignSettings`
- Actions: `updateSettings(partial)`, `resetDefaults`
- Persists to `chrome.storage.local` via `STORAGE_KEYS.SETTINGS`
- Loads defaults from `DEFAULT_SETTINGS` constant

#### [NEW] [useCampaign.ts](file:///c:/Business/Blink/src/sidepanel/hooks/useCampaign.ts)
- Wraps campaignStore with mount lifecycle
- On mount: calls `refreshStatus()`, sets up `chrome.storage.onChanged` listener
- On unmount: cleans up listener
- Returns campaign state + control actions
- Follows `rerender-move-effect-to-event` — campaign control is in event handlers, not effects

#### [NEW] [useStorage.ts](file:///c:/Business/Blink/src/sidepanel/hooks/useStorage.ts)
- Generic hook for reactive `chrome.storage.local` read/write
- `useStorage<T>(key: string, defaultValue: T)` → `[value, setValue]`
- Listens to `chrome.storage.onChanged` for external updates
- Cleanup on unmount

#### [NEW] [useGroupLists.ts](file:///c:/Business/Blink/src/sidepanel/hooks/useGroupLists.ts)
- Convenience hook wrapping groupStore
- Returns: `{ activeGroups, savedLists, activeListId, hasGroups, groupCount }`
- Derived primitive values for render optimization

---

### Campaign Dashboard Components

#### [NEW] [CampaignDashboard.tsx](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/CampaignDashboard.tsx) + [.module.css](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/CampaignDashboard.module.css)
- Main campaign control center, 4 states:
  - **Idle**: "Start Posting" CTA with post/group summary cards. Disabled if no post content or no groups. Shows what will be posted and where.
  - **Running**: Live progress tracker + pause/cancel controls
  - **Paused**: Resume/cancel buttons + progress so far
  - **Completed/Failed/Cancelled**: Results summary with retry option
- Glassmorphism card containers (`bg-glass` + `backdrop-filter`)
- Transition animations between states using `scaleIn` keyframe
- Uses `useCampaign` hook + `usePostStore` + `useGroupStore` for state
- Start button sends `START_CAMPAIGN` with current post draft, active group list ID, and settings

#### [NEW] [ProgressTracker.tsx](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/ProgressTracker.tsx) + [.module.css](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/ProgressTracker.module.css)
- Animated progress bar (gradient fill, shimmer animation while active)
- "X of Y posted" counter with large numbers
- Current group URL being posted to (with truncation)
- Estimated time remaining: `(remaining * avgDelay)` calculation
- Pulsing dot animation while posting to current group
- Step indicators showing each group's status (success/fail/pending/current)

#### [NEW] [ResultsSummary.tsx](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/ResultsSummary.tsx) + [.module.css](file:///c:/Business/Blink/src/sidepanel/components/CampaignDashboard/ResultsSummary.module.css)
- Summary stats row: total, succeeded (green), failed (red), skipped (yellow) — large number + label pairs
- Results table: group URL, status badge (color-coded), timestamp, error (expandable if present)
- "Retry Failed" button — creates new campaign with only failed URLs
- Empty state if no results
- Scrollable list with alternating row backgrounds

---

### Settings Component

#### [NEW] [Settings.tsx](file:///c:/Business/Blink/src/sidepanel/components/Settings/Settings.tsx) + [.module.css](file:///c:/Business/Blink/src/sidepanel/components/Settings/Settings.module.css)
- **Delay range**: Two number inputs (min/max seconds) with validation (min ≤ max, both ≥ 0)
- **Max retries**: Number input (0-10) with stepper buttons
- **Notification toggle**: Switch component for campaign completion notifications
- **Reset to Defaults**: Ghost button with confirmation
- Settings card with glassmorphism styling
- Each setting row: label + description + control
- Auto-saves on change (debounced 500ms)
- Uses `settingsStore`
- Visual section groupings: "Timing", "Retry Policy", "Notifications"

---

### App Shell Updates

#### [MODIFY] [App.tsx](file:///c:/Business/Blink/src/sidepanel/App.tsx)
- Replace placeholder divs with real `CampaignDashboard` and `Settings` components
- Add tab badges:
  - Groups tab: show active group count badge
  - Campaign tab: colored dot indicator (green=running, yellow=paused, hidden=idle)
- Wrap tab content in animated container (fade + translateY on tab switch)
- Import `ToastProvider` and wrap app

#### [MODIFY] [Layout.tsx](file:///c:/Business/Blink/src/sidepanel/components/shared/Layout.tsx)
- Add `badge` prop to Tab interface
- Render badge elements (count bubble or status dot) next to tab labels
- CSS for badge positioning

#### [MODIFY] [Layout.module.css](file:///c:/Business/Blink/src/sidepanel/components/shared/Layout.module.css)
- Badge styles: count bubble (small rounded pill), status dot (colored circle)
- Tab content transition container styles

---

### Tests

#### [NEW] [tests/component/CampaignDashboard.test.tsx](file:///c:/Business/Blink/tests/component/CampaignDashboard.test.tsx)
- Idle state renders "Start Posting" button
- Button disabled when no post or groups
- Running state shows progress tracker
- Pause/resume toggle
- Completed state shows results summary
- Failed groups show error messages

#### [NEW] [tests/component/Settings.test.tsx](file:///c:/Business/Blink/tests/component/Settings.test.tsx)
- Delay inputs update store values
- Min > max shows validation error
- Reset restores DEFAULT_SETTINGS
- Values persist (mock chrome.storage)

#### [NEW] [tests/e2e/campaign-flow.spec.ts](file:///c:/Business/Blink/tests/e2e/campaign-flow.spec.ts)
- Load extension in Chrome via Playwright
- Navigate to side panel
- Verify tab navigation works
- Compose a post (type text)
- Switch to groups tab, verify empty state
- Switch to campaign tab, verify "Start Posting" disabled
- Switch to settings tab, verify default values
- Basic smoke test — no real FB posting

---

## Architecture Notes (from skills)

### Vercel React Best Practices Applied
- `rerender-no-inline-components`: All sub-components (ProgressTracker, ResultsSummary, Toast items) extracted as standalone files
- `rerender-derived-state`: campaignStore exposes `isRunning`, `progress`, etc. as derived primitives, not raw objects
- `rerender-move-effect-to-event`: Campaign start/pause/resume in click handlers, not effects
- `bundle-barrel-imports`: Direct imports throughout, no barrel files
- `rerender-functional-setstate`: Zustand functional updaters where appropriate
- `rerender-lazy-state-init`: Settings store initializes from `DEFAULT_SETTINGS` constant
- `client-event-listeners`: Single `chrome.storage.onChanged` listener in campaignStore, not per-component
- `rendering-conditional-render`: Ternary for conditional renders, not `&&`

### Architecture Depth
- campaignStore is deep module — hides messaging protocol behind simple actions (`startCampaign`, `pause`, etc.)
- Settings store is separate from campaign store — different persistence lifecycles, different update frequencies
- Toast system uses React context (single provider) rather than scattered inline state per component
- Modal uses portal for correct z-index stacking outside component tree

### File Count Summary
| Category | New | Modified |
|----------|-----|----------|
| Components (TSX + CSS) | 14 files (7 components × 2) | 2 files |
| Stores | 2 files | 0 |
| Hooks | 3 files | 0 |
| Tests | 3 files | 0 |
| **Total** | **22 files** | **2 files** |

---

## Verification Plan

### Automated Tests
```bash
# Unit + Component tests
npm test

# Type checking
npx tsc --noEmit

# Lint
npm run lint
```

### Manual Verification
1. `npm run dev` → extension loads in Chrome without errors
2. All 4 tabs navigate and render correctly with transition animations
3. Campaign tab shows idle state with post/group summary
4. Start button disabled when no post or no groups
5. Settings tab shows controls with default values
6. Settings changes persist across panel close/reopen
7. Tab badges update (group count, campaign status dot)
8. Toast notifications render and auto-dismiss
9. Modal opens/closes with keyboard (Escape) and backdrop click
