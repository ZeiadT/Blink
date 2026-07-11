// ── Facebook Post Composer Interaction ───────────────────────────────────
// Drives the Lexical-based rich text editor via text insertion and native Lexical commands.
//
// Key insight from real Facebook DOM analysis (June 2026):
//   - The composer trigger has NO aria-label, NO data-pagelet
//   - It's a role="button" containing "Write something..." as text
//   - data-pagelet="GroupInlineComposer" has been REMOVED by Facebook
//   - execCommand fires trusted events that Lexical respects

import type { MediaFile } from '@shared/types';
import {
  waitForElement,
  waitForElementRemoval,
  waitForComposerTrigger,
  queryWithChain,
  COMPOSER_DIALOG,
  LEXICAL_EDITOR,
  PHOTO_VIDEO_BUTTON,
  FILE_INPUT,
  POST_BUTTON,
  SelectorTimeoutError,
} from './selectors';

// ── Error Types ──────────────────────────────────────────────────────────

export class ComposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComposerError';
  }
}

export class SubmitError extends ComposerError {
  constructor(message: string) {
    super(message);
    this.name = 'SubmitError';
  }
}

// Re-export so adapter can catch it
export { SelectorTimeoutError };

// ── Constants ────────────────────────────────────────────────────────────

const CHAR_DELAY_MIN_MS = 5;
const CHAR_DELAY_MAX_MS = 20;
const UPLOAD_TIMEOUT_PER_FILE_MS = 30_000;
const TEXT_VERIFICATION_TIMEOUT_MS = 1_000;
const TEXT_VERIFICATION_POLL_INTERVAL_MS = 25;

const BLOCK_ELEMENT_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'HEADER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'UL',
]);

// ── Module State ─────────────────────────────────────────────────────────

/** The currently active composer dialog. Set by openComposer, used to scope all subsequent queries. */
let activeDialog: Element | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Facebook insertion accepts canonical LF paragraph boundaries only. */
export function normalizeComposerText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Normalize browser-only DOM differences without changing post content. */
export function normalizeComposerVerificationText(text: string): string {
  return normalizeComposerText(text).replace(/\u00a0/g, ' ');
}

function isBlockElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_ELEMENT_TAGS.has(node.tagName);
}

function isEmptyBlockPlaceholder(element: HTMLElement): boolean {
  return element.childNodes.length === 1 && element.firstChild instanceof HTMLBRElement;
}

function readComposerNodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLBRElement) return '\n';
  if (!(node instanceof HTMLElement)) return '';
  if (isEmptyBlockPlaceholder(node)) return '';

  return Array.from(node.childNodes, readComposerNodeText).join('');
}

/**
 * Read Lexical DOM as logical plain text. `textContent` loses paragraph and
 * `<br>` boundaries, while `innerText` adds browser-specific visual spacing.
 */
export function readComposerText(editor: HTMLElement): string {
  let text = '';
  let previousTopLevelBlock = false;

  for (const node of Array.from(editor.childNodes)) {
    const isTopLevelBlock = isBlockElement(node);
    if (isTopLevelBlock && previousTopLevelBlock) text += '\n';

    text += readComposerNodeText(node);
    previousTopLevelBlock = isTopLevelBlock;
  }

  return text;
}

/** Send Enter through Lexical's keydown listener so it creates a new paragraph. */
export function dispatchComposerEnter(editor: HTMLElement): void {
  editor.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
    composed: true,
  }));
}

function firstTextDifference(expected: string, actual: string): number {
  const length = Math.min(expected.length, actual.length);
  for (let index = 0; index < length; index++) {
    if (expected[index] !== actual[index]) return index;
  }
  return length;
}

/** Wait for Lexical reconciliation, then reject content that would post incorrectly. */
export async function verifyComposerText(
  editor: HTMLElement,
  expectedText: string,
  timeoutMs: number = TEXT_VERIFICATION_TIMEOUT_MS,
): Promise<void> {
  const expected = normalizeComposerVerificationText(expectedText);
  const deadline = Date.now() + timeoutMs;
  let actual = normalizeComposerVerificationText(readComposerText(editor));

  while (actual !== expected && Date.now() < deadline) {
    await sleep(TEXT_VERIFICATION_POLL_INTERVAL_MS);
    actual = normalizeComposerVerificationText(readComposerText(editor));
  }

  if (actual !== expected) {
    const difference = firstTextDifference(expected, actual);
    throw new ComposerError(
      `Composer text verification failed at character ${difference} ` +
      `(expected ${expected.length}, received ${actual.length})`,
    );
  }
}

function simulateClick(element: Element): void {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

/** Get the dialog to scope queries within. Falls back to document. */
function getDialogRoot(): ParentNode {
  return activeDialog ?? document;
}

// ── Core Functions ───────────────────────────────────────────────────────

/**
 * Opens the post composer dialog.
 *
 * 1. Finds the trigger button by TEXT CONTENT ("Write something...")
 *    because Facebook does NOT put an aria-label on it.
 * 2. Clicks it to open the modal dialog.
 * 3. Waits for COMPOSER_DIALOG (dialog with contenteditable editor).
 * 4. Stores dialog reference for scoping all subsequent operations.
 */
export async function openComposer(): Promise<void> {
  console.log('[Blink:Composer] Opening composer...');
  activeDialog = null;

  // Find trigger by text content — the ONLY reliable way on current FB
  const trigger = await waitForComposerTrigger();
  console.log('[Blink:Composer] Found trigger:', trigger.textContent?.trim().slice(0, 40));

  simulateClick(trigger);

  // Wait for the composer dialog to appear
  try {
    activeDialog = await waitForElement(COMPOSER_DIALOG, 10_000);
    console.log('[Blink:Composer] Composer dialog opened');
  } catch (err) {
    if (err instanceof SelectorTimeoutError) {
      throw new ComposerError('Composer dialog did not open after clicking trigger');
    }
    throw err;
  }

  // Verify Lexical editor is inside the dialog
  try {
    await waitForElement(LEXICAL_EDITOR, 5_000, activeDialog);
  } catch (err) {
    if (err instanceof SelectorTimeoutError) {
      throw new ComposerError('Lexical editor not found inside composer dialog');
    }
    throw err;
  }

  console.log('[Blink:Composer] Composer opened successfully');
}

/**
 * Types text into the Lexical editor using document.execCommand for characters
 * and Lexical's own keydown handling for paragraph boundaries.
 *
 * execCommand('insertText') fires events Lexical processes. Newlines use a
 * bubbling Enter event because Facebook's editor owns paragraph creation.
 *
 * Random delay between chars (5–20ms) for realism.
 */
export async function typeText(text: string): Promise<void> {
  const normalizedText = normalizeComposerText(text);
  if (!normalizedText) return;

  console.log('[Blink:Composer] Typing text...', normalizedText.length, 'chars');

  const editor = await waitForElement(LEXICAL_EDITOR, 5_000, getDialogRoot()) as HTMLElement;
  editor.focus();

  // Settle delay after focus
  await sleep(100);

  for (const char of normalizedText) {
    if (char === '\n') {
      dispatchComposerEnter(editor);
    } else {
      document.execCommand('insertText', false, char);
    }
    await sleep(randomInt(CHAR_DELAY_MIN_MS, CHAR_DELAY_MAX_MS));
  }

  await verifyComposerText(editor, normalizedText);

  console.log('[Blink:Composer] Text typed successfully');
}

/**
 * Attaches media files to the post via the hidden file input.
 * Converts each MediaFile.dataUrl back to a File via fetch + blob,
 * then sets them on the file input via DataTransfer.
 *
 * Photo/video button is searched within the dialog.
 * File input may live outside dialog (FB sometimes puts it on document.body),
 * so it falls back to document-level search.
 */
export async function attachMedia(mediaFiles: MediaFile[]): Promise<void> {
  if (!mediaFiles.length) return;

  console.log('[Blink:Composer] Attaching', mediaFiles.length, 'media files...');

  const dialogRoot = getDialogRoot();

  // Try clicking the Photo/Video button (scoped within dialog)
  const photoBtn = queryWithChain(PHOTO_VIDEO_BUTTON, dialogRoot);
  if (photoBtn && photoBtn.tagName !== 'INPUT') {
    simulateClick(photoBtn);
    await sleep(500);
  }

  // File input may be outside dialog — try dialog first, then document
  let fileInput: HTMLInputElement;
  const dialogInput = queryWithChain(FILE_INPUT, dialogRoot);
  if (dialogInput) {
    fileInput = dialogInput as HTMLInputElement;
  } else {
    fileInput = await waitForElement(FILE_INPUT) as HTMLInputElement;
  }

  // Convert data URLs to File objects
  const files: File[] = [];
  for (const mf of mediaFiles) {
    const response = await fetch(mf.dataUrl);
    const blob = await response.blob();
    const file = new File([blob], mf.name, { type: mf.mimeType });
    files.push(file);
  }

  // Use DataTransfer to set files on the input
  const dt = new DataTransfer();
  for (const file of files) {
    dt.items.add(file);
  }
  fileInput.files = dt.files;

  // Dispatch change event to trigger Facebook's upload handler
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  // Wait for uploads to complete
  await waitForUploadComplete(mediaFiles.length);

  console.log('[Blink:Composer] Media attached successfully');
}

/**
 * Watches for upload thumbnails/previews to appear in the composer dialog.
 * Polls thumbnail count until it matches expected.
 */
export async function waitForUploadComplete(expectedCount: number): Promise<void> {
  const timeout = expectedCount * UPLOAD_TIMEOUT_PER_FILE_MS;
  const startTime = Date.now();
  const dialogRoot = getDialogRoot();

  return new Promise<void>((resolve, reject) => {
    const check = () => {
      const searchRoot = dialogRoot instanceof Element ? dialogRoot : document;
      const thumbnails = searchRoot.querySelectorAll(
        'img[src^="blob:"], ' +
        'video[src^="blob:"], ' +
        '[data-visualcompletion="media-upload"]',
      );

      if (thumbnails.length >= expectedCount) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new ComposerError(
          `Upload timed out: expected ${expectedCount} files, found ${thumbnails.length}`,
        ));
      }
    };

    const interval = setInterval(check, 500);
    check();
  });
}

/**
 * Submits the post by clicking the Post button.
 * Searches within the active dialog to avoid hitting unrelated buttons.
 * Waits for the dialog to close as confirmation.
 */
export async function submitPost(): Promise<void> {
  console.log('[Blink:Composer] Submitting post...');

  const dialogRoot = getDialogRoot();

  // Try CSS selector first
  let postBtn: HTMLElement | null = queryWithChain(POST_BUTTON, dialogRoot) as HTMLElement | null;

  // Fallback: find by text content within dialog
  if (!postBtn && activeDialog) {
    const buttons = activeDialog.querySelectorAll('[role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      if (text === 'Post' || text === 'post') {
        postBtn = btn as HTMLElement;
        break;
      }
    }
  }

  if (!postBtn) {
    // Last resort: wait for it to appear
    postBtn = await waitForElement(POST_BUTTON, 10_000, dialogRoot) as HTMLElement;
  }

  console.log('[Blink:Composer] Found post button:', postBtn.getAttribute('aria-label') ?? postBtn.textContent?.trim());

  // Verify button is not disabled
  if (postBtn.getAttribute('aria-disabled') === 'true') {
    console.log('[Blink:Composer] Post button disabled, waiting 2s...');
    await sleep(2000);
    if (postBtn.getAttribute('aria-disabled') === 'true') {
      throw new SubmitError('Post button is disabled — post may be invalid');
    }
  }

  simulateClick(postBtn);

  // Wait for confirmation — dialog close
  if (activeDialog) {
    try {
      await waitForElementRemoval(activeDialog, 15_000);
      console.log('[Blink:Composer] Post submitted — dialog closed');
    } catch {
      throw new SubmitError('Composer dialog did not close after clicking Post');
    } finally {
      activeDialog = null;
    }
  } else {
    await sleep(3000);
  }

  console.log('[Blink:Composer] Post submitted successfully');
}
