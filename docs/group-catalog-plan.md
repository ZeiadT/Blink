# Phase 2 Plan: Group Catalog, Custom Names, and Import

## Goal

Turn group intake into one durable catalog domain shared by manual entry, saved
lists, imports, and campaign target snapshots. Identify Facebook groups by a
normalized group ID, preserve user-facing names, migrate legacy URL-only data,
and provide a safe preview-before-confirm import workflow.

Phase 1's durable campaign runner remains unchanged. Campaigns continue to
capture copied target snapshots and must never mutate saved-group storage.

## User outcomes

- The same Facebook group cannot be added twice through URL variations, raw ID,
  manual entry, saved lists, or imports.
- Every group has a stable display name that the user can edit.
- Existing groups and saved lists migrate without data loss.
- CSV and TXT files can be selected or dropped, reviewed, and confirmed before
  any storage write.
- Invalid and duplicate rows show concise, row-specific reasons.
- Storage and migration failures remain visible and actionable.

## Scope

### Existing files

- src/shared/types.ts
- src/shared/constants.ts
- src/shared/validators.ts
- src/background/storage.ts
- src/sidepanel/store/groupStore.ts
- src/sidepanel/hooks/useGroupLists.ts
- src/sidepanel/components/GroupManager/GroupManager.tsx
- src/sidepanel/components/GroupManager/GroupUrlInput.tsx
- src/sidepanel/components/GroupManager/GroupListEditor.tsx
- src/sidepanel/components/GroupManager/SavedLists.tsx
- Matching unit and component tests

### Planned modules

- src/shared/groupCatalog.ts
  - Group ID and URL normalization
  - Canonical URL construction
  - Legacy entry migration
  - ID-based duplicate detection
  - Display-name normalization and fallback
- src/shared/groupImport.ts
  - CSV/TXT decoding and separator detection
  - Header mapping
  - Row validation and typed row reasons
  - Import preview summary
- src/sidepanel/components/GroupManager/GroupImportPanel.tsx
  - File select and drop zone
  - Preview, counts, row issues, confirm, and cancel

Module names may change during implementation, but domain parsing must remain
outside React components and Zustand actions.

## Domain model

Modern GroupEntry records should include:

- groupId: normalized Facebook group slug or numeric ID
- url: canonical Facebook group URL
- name: required display name
- Existing posting metadata such as lastPostStatus and lastPostAt

Compatibility rules:

- Read legacy records shaped as { url, label? }.
- Derive groupId from the URL.
- Preserve a non-empty legacy label as name.
- Fall back to groupId when no usable name exists.
- Keep migration idempotent; reading an already-modern record must not rewrite
  or rename it.
- Do not modify campaign target snapshots during catalog migration.
- Invalid legacy entries fail closed, remain reported, and are not silently
  discarded.

## Normalization rules

1. Trim surrounding whitespace.
2. Accept supported Facebook group URLs and raw group IDs.
3. Extract the path segment immediately following /groups/.
4. Decode safe URL encoding, reject empty or unsupported IDs, and normalize
   case for duplicate comparison.
5. Build one canonical URL:
   https://www.facebook.com/groups/{groupId}
6. Ignore query strings, fragments, trailing slashes, and supported Facebook
   subdomain variants when comparing identity.
7. Deduplicate by normalized groupId, not by the original URL string.
8. Trim display names, collapse accidental surrounding whitespace, enforce a
   shared maximum length, and fall back to groupId.

## Storage and migration

1. Add a schema version for active groups and saved group lists.
2. Load both storage keys through one catalog migration path.
3. Migrate active groups and every saved-list entry in memory.
4. Detect collisions created by ID normalization.
5. Keep the earliest entry's posting metadata and prefer the first non-fallback
   display name.
6. Persist the complete migrated snapshot only after all records validate.
7. On write failure, keep the previous stored value and return a typed error to
   the store.
8. Record migration completion so normal loads do not repeatedly rewrite data.
9. Keep background campaign snapshot migration compatible with both legacy and
   modern GroupEntry shapes.

Storage mutations should return explicit success or failure results. UI actions
must not rely on fire-and-forget persistence.

## Manual group workflow

- Manual input accepts one entry per line.
- Each line may contain a Facebook group URL or raw group ID.
- New entries receive a fallback display name from groupId.
- Duplicate feedback identifies the existing group name.
- Group rows expose an accessible inline name editor.
- Empty edits restore the fallback name.
- Remove, clear, save-list, load-list, rename-list, and delete-list actions use
  groupId identity and persist before reporting success.
- Saved lists copy entries so later active-list edits cannot mutate saved data.

## Import contract

### Supported files

- Extensions: .csv and .txt
- Encodings: UTF-8 with optional BOM
- Maximum file size: 1 MiB
- Maximum non-empty rows: 2,000
- Accepted separators: comma, semicolon, tab, or one-entry-per-line text
- Quoted CSV fields may contain separators and escaped quotes

Centralize these limits in shared constants so tests and UI use the same values.

### Accepted columns

- Required identity column: groupId, id, url, or groupUrl
- Optional name column: name, groupName, label, or displayName
- Header matching is trimmed and case-insensitive
- Headerless one-column files treat each row as a URL or raw group ID
- Headerless two-column files treat columns as identity then name

### Preview result

Each parsed row returns:

- Source row number
- Original identity and name text
- Normalized candidate, when valid
- Status: valid, duplicate, or invalid
- Typed reason code and concise user-facing reason

Preview also returns valid, duplicate, invalid, and total counts.

Duplicate checks cover:

- Earlier rows in the same file
- Current active groups
- The selected saved-list destination, when importing there

Parsing never writes storage. Confirm writes only valid, non-duplicate
candidates from the displayed preview. Cancel clears the preview and writes
nothing.

## Import UI

- Place an Import groups action beside manual entry.
- Use one focused panel or dialog with select and drop affordances.
- Show file name, size, detected format, and summary counts.
- Keep valid rows visually quiet; emphasize invalid and duplicate reasons.
- Allow issue filtering without hiding total counts.
- Disable Confirm when no valid rows exist or while persistence is pending.
- Preserve the preview after a storage failure so the user can retry.
- Announce parse and persistence results through accessible status text and the
  existing toast system.
- Include concise information that Blink does not join groups or bypass
  Facebook membership/posting permissions.

## Store contract

Refactor groupStore around catalog operations:

- hydrateCatalog(): migrate and load active groups plus saved lists
- addEntries(inputs): normalize, deduplicate, persist, then commit state
- renameGroup(groupId, name): persist a normalized display name
- removeGroup(groupId)
- importPreview(file): parse only; no persistence
- confirmImport(previewId): reject stale previews, persist accepted rows once
- cancelImport()
- saveList, loadList, renameList, and deleteList with typed results

Store selectors should stay narrow. Components should subscribe only to state
and actions they render, avoiding full-store subscriptions and derived-state
effects.

## Implementation sequence

### 1. Catalog domain

- Add modern group types, normalization, canonicalization, name fallback, and
  duplicate result types.
- Replace URL-based deduplication with groupId-based catalog functions.
- Add exhaustive pure unit tests before store changes.

### 2. Migration and persistence

- Add schema version and idempotent active/saved-list migration.
- Add collision handling and typed storage errors.
- Update campaign snapshot cloning and compatibility tests.

### 3. Manual UI

- Update store actions to use groupId identity.
- Add inline custom-name editing.
- Update active-list and saved-list rendering without changing campaign runner
  ownership.

### 4. Import parser and preview

- Implement bounded file reading, CSV/TXT parsing, headers, separators, and row
  reasons.
- Add select/drop UI, summary, issue rows, confirm, and cancel.
- Keep preview state separate from persisted catalog state.

### 5. Regression and manual verification

- Run catalog, migration, import, store, component, campaign runner, and full
  extension tests.
- Complete Chrome manual verification with real CSV/TXT samples.

## Tests

### Unit

- URL variants and raw IDs normalize to one groupId and canonical URL.
- Numeric IDs, slugs, supported subdomains, query strings, fragments, and
  trailing slashes.
- Empty, malformed, unsupported, or extra-path identities fail with typed
  reasons.
- Legacy label migration, fallback names, idempotence, and collision merging.
- Manual and import paths share identical duplicate behavior.
- CSV quoting, BOM, comma, semicolon, tab, headers, headerless rows, blank rows,
  Arabic names, emoji, and CRLF/LF files.
- File-size and row-count limits.
- Duplicate detection within files and against stored destinations.
- Storage failure leaves previous state intact and returns an actionable error.

### Store and component

- Hydration migrates active groups and saved lists once.
- Inline name edits persist and survive reload.
- Saved-list copies do not share mutable group references.
- File select and drop produce the same preview.
- Preview counts and row reasons render correctly.
- Confirm persists only valid unique rows once.
- Cancel and failed import write nothing.
- Confirm is disabled with no valid rows and during persistence.
- Membership/permission information is visible.

### Regression

- Starting a campaign snapshots modern catalog entries.
- Editing or importing groups after start cannot alter an active campaign.
- Legacy campaign snapshots remain recoverable.
- Durable runner pause, resume, alarm, and no-repost tests remain green.

## Manual verification

1. Load legacy active groups and saved lists; confirm names and counts survive
   one migration and storage is not rewritten on the next load.
2. Add the same group through www URL, mobile URL, query URL, and raw ID;
   confirm one catalog entry remains.
3. Edit a group name, reload the side panel, and confirm persistence.
4. Import comma, semicolon, tab, and one-column TXT samples containing valid,
   duplicate, invalid, Arabic, and emoji rows.
5. Review counts and row reasons; cancel and confirm storage is unchanged.
6. Repeat import, confirm only valid unique rows, then reload the extension.
7. Simulate a storage write failure; confirm preview remains and error is
   actionable.
8. Start a campaign, then rename/import groups; confirm campaign targets remain
   unchanged.

## Out of scope

- Automatically scraping Facebook group names
- Joining groups or changing membership/posting permissions
- Cloud sync or remote catalog storage
- Campaign history
- Saved-post library
- Delay settings redesign

## Exit criteria

- All group identity and duplicate decisions use normalized groupId.
- Existing active groups and saved lists migrate without silent data loss.
- Custom names persist across reloads.
- Import writes nothing before confirmation.
- Every rejected import row has a stable reason.
- Storage failures preserve previous data and remain retryable.
- Campaign snapshots remain isolated from catalog mutations.
- Type-check, lint, all tests, and production build pass.
