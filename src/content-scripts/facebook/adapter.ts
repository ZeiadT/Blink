// ── Facebook Content Script — Full PlatformAdapter ──────────────────────
// Replaces the CP1 stub with complete post execution flow.

import type { PlatformAdapter, PostDraft, PostResult } from '@shared/types';
import { isValidFacebookGroupUrl } from '@shared/validators';
import { isComposerAvailable, isGroupPage, getGroupInfo } from './detector';
import {
  openComposer,
  typeText,
  attachMedia,
  submitPost,
  ComposerError,
} from './composer';

// ── Adapter Implementation ───────────────────────────────────────────────

class FacebookAdapter implements PlatformAdapter {
  readonly platformId = 'facebook' as const;
  readonly platformName = 'Facebook' as const;

  isValidGroupUrl(url: string): boolean {
    return isValidFacebookGroupUrl(url);
  }

  detectGroupPage(): boolean {
    return isGroupPage();
  }

  async executePost(post: PostDraft): Promise<PostResult> {
    const groupUrl = window.location.href;
    const groupInfo = getGroupInfo();
    const groupLabel = groupInfo?.name ?? groupUrl;

    console.log(`[Blink:FB] Executing post on "${groupLabel}"...`);

    try {
      // 1. Verify we're on a group page
      if (!isGroupPage()) {
        return {
          groupUrl,
          status: 'failed',
          error: 'Not on a valid Facebook group page',
          retryable: false,
          timestamp: Date.now(),
        };
      }

      if (!isComposerAvailable()) {
        return {
          groupUrl,
          status: 'failed',
          error: 'Posting is unavailable. The group may be inaccessible or you may not have permission to post.',
          retryable: false,
          timestamp: Date.now(),
        };
      }

      // 2. Open composer
      console.log('[Blink:FB] Step 1/4: Opening composer');
      await openComposer();

      // 3. Type text (if present)
      if (post.text.trim()) {
        console.log('[Blink:FB] Step 2/4: Typing text');
        await typeText(post.text);
      } else {
        console.log('[Blink:FB] Step 2/4: No text — skipping');
      }

      // 4. Attach media (if present)
      if (post.mediaFiles.length > 0) {
        console.log('[Blink:FB] Step 3/4: Attaching', post.mediaFiles.length, 'media files');
        await attachMedia(post.mediaFiles);
      } else {
        console.log('[Blink:FB] Step 3/4: No media — skipping');
      }

      // 5. Submit
      console.log('[Blink:FB] Step 4/4: Submitting post');
      await submitPost();

      console.log(`[Blink:FB] Post succeeded on "${groupLabel}"`);
      return {
        groupUrl,
        status: 'success',
        timestamp: Date.now(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorType = err instanceof ComposerError ? err.name : 'UnknownError';
      console.error(`[Blink:FB] Post failed on "${groupLabel}":`, errorType, errorMessage);

      return {
        groupUrl,
        status: 'failed',
        error: `${errorType}: ${errorMessage}`,
        timestamp: Date.now(),
      };
    }
  }
}

// ── Content Script Entry Point ───────────────────────────────────────────

(() => {
  // Guard against multiple injections
  if ((window as unknown as Record<string, boolean>).__BLINK_INJECTED) {
    return;
  }
  (window as unknown as Record<string, boolean>).__BLINK_INJECTED = true;

  console.log('[Blink] Facebook content script injected on:', window.location.href);

  const adapter = new FacebookAdapter();

  // Listen for messages from the background service worker
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[Blink:ContentScript] Received message:', message.type);

    if (message.type === 'EXECUTE_POST') {
      const payload = message.payload as { text: string; mediaFiles: import('@shared/types').MediaFile[] };

      // Build a PostDraft from the payload
      const postDraft: PostDraft = {
        id: 'runtime',
        text: payload.text,
        mediaFiles: payload.mediaFiles,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      adapter.executePost(postDraft).then((result) => {
        sendResponse({ type: 'POST_RESULT', payload: result });
      });

      // Return true to indicate async response
      return true;
    }

    return false;
  });
})();

export { FacebookAdapter };
