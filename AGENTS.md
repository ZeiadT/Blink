# Repository Guidelines

## Project Structure & Module Organization

Blink is a TypeScript/React Chrome Manifest V3 extension. `src/background/` holds the service worker, orchestration, scheduling, and storage. `src/content-scripts/` contains platform adapters and DOM automation; `src/sidepanel/` contains the React UI, components, hooks, Zustand stores, and CSS. Put cross-layer domain types, messages, constants, validators, and utilities in `src/shared/`.

Tests live under `tests/unit/` and `tests/component/`; `tests/setup.ts` supplies browser mocks. Extension icons belong in `public/icons/`, and `scripts/` contains maintenance helpers. Vite produces `dist/`; treat it as generated output and do not edit it.

## Build, Test, and Development Commands

- `npm run dev` starts the Vite development build/watch workflow.
- `npm run build` creates the production extension bundle in `dist/`.
- `npm run preview` serves the built output for local inspection.
- `npm test` runs the Vitest suite once; `npm run test:watch` keeps it running.
- `npm run lint` checks TypeScript/TSX source with ESLint.

Load `dist/` via Chrome's **Load unpacked** flow. Reload the extension after changes to background service workers or content scripts.

## Coding Style & Naming Conventions

Write strict TypeScript and use configured aliases: `@sidepanel`, `@background`, `@content`, and `@shared`. Prettier uses 2 spaces, single quotes, semicolons, trailing commas, and a 100-character print width. Name React components and their directories in PascalCase (`GroupManager/GroupManager.tsx`), hooks `useX`, Zustand stores `xStore`, and other modules in lower camel case. Keep component styles adjacent as `Component.module.css`.

## Testing Guidelines

Use Vitest, Testing Library, and jsdom. Place non-UI tests at `tests/unit/<subject>.test.ts` and UI tests at `tests/component/<Component>.test.tsx`. Use `describe` blocks and `it('should ...')` statements; add or adjust matching tests for every behavior change. No coverage threshold is configured.

## Commit & Pull Request Guidelines

Use Conventional Commits with a concise, lowercase type and imperative subject: `feat: add campaign retry notice` or `fix: validate group URLs`. Keep PRs focused. Describe the behavioral change, list validation performed, link an issue when applicable, and include screenshots for side-panel/UI changes.
