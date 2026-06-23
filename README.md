# Blink — Multi-Group Facebook Poster

> **Compose once. Post to many Facebook groups — automatically.**

Blink is a Chrome extension (Manifest V3) that lets you write a post once, select a list of Facebook groups, and have Blink navigate to each group and publish the post with human-like pacing. Built with React 19, TypeScript, Zustand, and Vite.

---

## Features

- **Post Composer** — Rich text + up to 20 images/videos per post, with live preview
- **Group Manager** — Paste bulk URLs, label groups, save/load named lists
- **Campaign Engine** — Background service worker drives navigation and posting with configurable random delays
- **Progress Dashboard** — Real-time per-group status (success / failed / skipped), retry count, elapsed time
- **Crash Recovery** — If the service worker restarts mid-campaign, the orchestrator resumes from the last checkpoint
- **Settings** — Tune delay range (min/max seconds) and max retries per group
- **Platform-Adapter pattern** — Facebook is the first adapter; the architecture supports adding more platforms

---

## Architecture

```
src/
├── background/           # MV3 service worker
│   ├── index.ts          # Message router + lifecycle hooks
│   ├── orchestrator.ts   # CampaignOrchestrator — drives the posting loop
│   ├── scheduler.ts      # randomDelay() + KeepAliveScheduler (chrome.alarms)
│   └── storage.ts        # Typed chrome.storage.local wrappers
│
├── content-scripts/
│   └── facebook/
│       ├── adapter.ts    # PlatformAdapter implementation + content script entry
│       ├── composer.ts   # Lexical editor interaction (open → type → attach → submit)
│       ├── detector.ts   # Group-page detection
│       └── selectors.ts  # CSS selector strategy + waitForElement helpers
│
├── sidepanel/            # React 19 side panel UI
│   ├── App.tsx           # Root: tab routing + badge/status-dot wiring
│   ├── components/
│   │   ├── PostComposer/ # Text area, MediaUploader, PostPreview
│   │   ├── GroupManager/ # GroupUrlInput, GroupListEditor, SavedLists
│   │   ├── CampaignDashboard/ # ProgressTracker, ResultsSummary
│   │   ├── Settings/     # Delay + retry controls
│   │   └── shared/       # Button, Layout, Modal, Toast
│   ├── hooks/            # useCampaign, useGroupLists, useStorage
│   ├── store/            # Zustand: campaignStore, groupStore, postStore, settingsStore
│   └── styles/           # CSS variables, global reset, animations
│
└── shared/               # Zero-runtime boundary — imported by all layers
    ├── types.ts           # Domain types + message discriminated unions
    ├── messages.ts        # Type guards + factory functions for every message
    ├── constants.ts       # Storage keys, media constraints, default settings
    ├── validators.ts      # URL validation, media validation, deduplication
    └── utils.ts           # generateId, formatFileSize, truncate, sleep
```

### Message Flow

```
Side Panel ──START_CAMPAIGN──► Background (orchestrator.start)
                                    │
                               for each group:
                                    │
                               chrome.tabs.update ──► Facebook Group Page
                                    │                       │
                               EXECUTE_POST ──────────────► content script
                                    │                       │
                               POST_RESULT ◄────────────────┘
                                    │
                          CAMPAIGN_STATUS_UPDATE ──► Side Panel (Zustand)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Chrome MV3 service worker |
| UI | React 19 + CSS Modules |
| State | Zustand v5 |
| Build | Vite 8 + `@crxjs/vite-plugin` |
| Language | TypeScript 5.5 |
| Testing | Vitest + @testing-library/react |
| Icons | Lucide React |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Chrome (or Chromium-based browser) with developer mode enabled

### Install

```bash
git clone https://github.com/your-username/blink.git
cd blink
npm install
```

### Development

```bash
npm run dev
```

Vite will output a `dist/` folder. Load it as an unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. Click the Blink icon in the toolbar or find it in the extensions panel

Hot-module replacement works for the side panel UI. Service worker and content script changes require reloading the extension.

### Production Build

```bash
npm run build
```

### Tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

### Lint

```bash
npm run lint
```

---

## Usage

1. **Navigate to any Facebook page** — the side panel opens when you click the Blink extension icon.
2. **Compose** — write your post text and optionally attach images/videos.
3. **Groups** — paste Facebook group URLs (one per line), add labels, and optionally save the list for reuse.
4. **Campaign** — review the group count, adjust delay settings if needed, then click **Start**. Blink will open/reuse a Facebook tab and post to each group in sequence.
5. **Monitor** — watch real-time progress in the Campaign tab. You can **Pause**, **Resume**, or **Cancel** at any point.

---

## Configuration

Open the **Settings** tab to configure:

| Setting | Default | Description |
|---|---|---|
| Delay min (s) | 30 | Minimum wait between groups |
| Delay max (s) | 60 | Maximum wait between groups |
| Max retries | 2 | Retry attempts per group on failure |

---

## Development Notes

### Platform Adapter

To add a new platform (e.g., LinkedIn), implement the `PlatformAdapter` interface in `src/shared/types.ts`:

```typescript
interface PlatformAdapter {
  readonly platformId: string;
  readonly platformName: string;
  isValidGroupUrl(url: string): boolean;
  executePost(post: PostDraft): Promise<PostResult>;
  detectGroupPage(): boolean;
}
```

Register the adapter in `src/content-scripts/registry.ts`.

### Facebook DOM Strategy

Facebook uses a Lexical-based rich text editor. The composer drives it via `document.execCommand('insertText')` which fires trusted `beforeinput`/`input` events that Lexical respects. Direct synthetic event dispatch does not work.

The trigger button is located by text content (`"Write something..."`) because Facebook does not expose a stable `aria-label` or `data-pagelet` on it.

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## License

[MIT](./LICENSE) © 2026 Blink Contributors
