// ── Selector Strategy Chains ─────────────────────────────────────────────
// Facebook's class names are obfuscated and rotate ~weekly.
// The actual DOM does NOT use aria-labels on the composer trigger;
// the "Write something..." text is rendered as inner span content.
// data-pagelet attributes have been removed entirely by Facebook.

export interface SelectorChain {
  /** Human-readable name (e.g. "composer trigger", "post button") */
  name: string;
  /** CSS selectors tried in order — first match wins */
  strategies: string[];
}

// ── Error Types ──────────────────────────────────────────────────────────

export class SelectorTimeoutError extends Error {
  constructor(
    public readonly chain: SelectorChain,
    public readonly timeoutMs: number,
  ) {
    super(`[Blink] Timed out (${timeoutMs}ms) waiting for "${chain.name}"`);
    this.name = 'SelectorTimeoutError';
  }
}

// ── Chain Definitions ────────────────────────────────────────────────────

/**
 * Lexical contenteditable div inside the composer DIALOG.
 * Searched within COMPOSER_DIALOG scope by composer.ts.
 */
export const LEXICAL_EDITOR: SelectorChain = {
  name: 'lexical editor',
  strategies: [
    '[role="textbox"][contenteditable="true"][aria-label*="create a"]',
    '[role="textbox"][contenteditable="true"][aria-label*="Write"]',
    'div[contenteditable="true"][data-lexical-editor="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][spellcheck="true"]',
  ],
};

/**
 * The composer modal dialog that opens after clicking the trigger.
 * Uses :has() to find a dialog containing a contenteditable editor,
 * avoiding unrelated dialogs (e.g. Messenger, notifications).
 */
export const COMPOSER_DIALOG: SelectorChain = {
  name: 'composer dialog',
  strategies: [
    'div[role="dialog"]:has([role="textbox"][contenteditable="true"]):not([aria-label="Messenger"])',
    'div[role="dialog"]:has([contenteditable="true"]):not([aria-label="Messenger"])',
  ],
};

/**
 * Media attachment trigger in composer toolbar.
 * Searched within COMPOSER_DIALOG.
 */
export const PHOTO_VIDEO_BUTTON: SelectorChain = {
  name: 'photo/video button',
  strategies: [
    '[aria-label="Photo/video"]',
    '[aria-label*="Photo"][role="button"]',
    '[aria-label*="photo"][role="button"]',
    '[aria-label="Attach a photo or video"]',
  ],
};

/**
 * Hidden file input revealed by photo/video click.
 * May live outside dialog (FB sometimes puts it on document.body).
 */
export const FILE_INPUT: SelectorChain = {
  name: 'file input',
  strategies: [
    'input[type="file"][accept*="image"][accept*="video"]',
    'input[type="file"][accept*="image"]',
    'form input[type="file"]',
  ],
};

/**
 * Post submit button inside the composer dialog.
 * Searched within COMPOSER_DIALOG scope.
 */
export const POST_BUTTON: SelectorChain = {
  name: 'post button',
  strategies: [
    '[aria-label="Post"][role="button"]',
    '[aria-label="post"][role="button"]',
    'form [role="button"][aria-label="Post"]',
    'form [role="button"][aria-label="post"]',
  ],
};

// ── Query Utilities ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Synchronous — tries each strategy in order, returns first match or null.
 */
export function queryWithChain(chain: SelectorChain, root: ParentNode = document): Element | null {
  for (const selector of chain.strategies) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return null;
}

/**
 * Find the composer trigger by text content.
 *
 * Facebook's composer trigger is a `role="button"` element containing
 * "Write something..." as inner text. It has NO aria-label.
 * data-pagelet attributes have been removed by Facebook entirely.
 *
 * Strategy: find all role="button" elements, check their textContent
 * for known trigger phrases.
 */
export function findComposerTrigger(root: ParentNode = document): Element | null {
  const TRIGGER_PHRASES = [
    'Write something',
    'What\'s on your mind',
    'Create your first post',
    'Create a public post',
  ];

  const buttons = root.querySelectorAll('[role="button"][tabindex="0"]');
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? '';
    for (const phrase of TRIGGER_PHRASES) {
      if (text.includes(phrase)) {
        return btn;
      }
    }
  }
  return null;
}

/**
 * Async version — waits for the composer trigger to appear.
 * Uses MutationObserver since the composer area may load lazily.
 */
export function waitForComposerTrigger(
  timeout: number = DEFAULT_TIMEOUT_MS,
  root: ParentNode = document,
): Promise<Element> {
  const existing = findComposerTrigger(root);
  if (existing) return Promise.resolve(existing);

  return new Promise<Element>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      reject(new SelectorTimeoutError(
        { name: 'composer trigger', strategies: ['[text-content search]'] },
        timeout,
      ));
    }, timeout);

    const observer = new MutationObserver(() => {
      if (settled) return;
      const el = findComposerTrigger(root);
      if (el) {
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    const observeTarget = root instanceof Document ? root.body ?? root.documentElement : root;
    observer.observe(observeTarget, { childList: true, subtree: true });
  });
}

/**
 * Async — tries each strategy, then falls back to MutationObserver.
 * Rejects with SelectorTimeoutError after timeout.
 */
export function waitForElement(
  chain: SelectorChain,
  timeout: number = DEFAULT_TIMEOUT_MS,
  root: ParentNode = document,
): Promise<Element> {
  // Immediate check first
  const existing = queryWithChain(chain, root);
  if (existing) return Promise.resolve(existing);

  return new Promise<Element>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      reject(new SelectorTimeoutError(chain, timeout));
    }, timeout);

    const observer = new MutationObserver(() => {
      if (settled) return;
      const el = queryWithChain(chain, root);
      if (el) {
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(el);
      }
    });

    // Observe the whole subtree for additions
    const observeTarget = root instanceof Document ? root.body ?? root.documentElement : root;
    observer.observe(observeTarget, { childList: true, subtree: true });
  });
}

/**
 * Waits for an element to be removed from the DOM.
 * Resolves when the element is no longer connected.
 */
export function waitForElementRemoval(
  element: Element,
  timeout: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (!element.isConnected) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      reject(new Error(`[Blink] Timed out (${timeout}ms) waiting for element removal`));
    }, timeout);

    const observer = new MutationObserver(() => {
      if (settled) return;
      if (!element.isConnected) {
        settled = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });

    const parent = element.parentNode ?? document.body;
    observer.observe(parent, { childList: true, subtree: true });
  });
}
