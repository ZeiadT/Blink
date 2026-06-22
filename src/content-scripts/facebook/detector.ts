// ── Facebook Group Page Detector ─────────────────────────────────────────
// Pure DOM reads — no side effects, no async.
//
// Note: Facebook has REMOVED data-pagelet attributes entirely (June 2026).
// Detection now relies on URL pattern + role="main" heading presence.

import { isValidFacebookGroupUrl } from '@shared/validators';
import { findComposerTrigger } from './selectors';

/**
 * Validates that the current page is a Facebook group page.
 * Checks both URL pattern AND DOM structure.
 *
 * DOM markers (data-pagelet removed by Facebook):
 *   - [role="main"] h1   — group heading
 *   - [role="main"]       — main content area
 *   - findComposerTrigger — "Write something..." button
 */
export function isGroupPage(): boolean {
  if (!isValidFacebookGroupUrl(window.location.href)) return false;

  // At least one structural marker must confirm group page
  const hasMainHeading = document.querySelector('[role="main"] h1') !== null;
  const hasMainContent = document.querySelector('[role="main"]') !== null;
  const hasComposer = findComposerTrigger() !== null;

  return hasMainHeading || hasComposer || hasMainContent;
}

/**
 * Extracts group metadata from the current page.
 * Returns null if not on a group page.
 */
export function getGroupInfo(): { name: string; url: string } | null {
  if (!isValidFacebookGroupUrl(window.location.href)) return null;

  // Try extracting group name from the page heading
  const heading = document.querySelector('[role="main"] h1');
  const name = heading?.textContent?.trim() ?? 'Unknown Group';

  return {
    name,
    url: window.location.href,
  };
}

/**
 * Checks whether the composer trigger element exists.
 * Uses text-content-based search for the "Write something..." button.
 * If absent, user likely lacks posting permissions in this group.
 */
export function isComposerAvailable(): boolean {
  return findComposerTrigger() !== null;
}
