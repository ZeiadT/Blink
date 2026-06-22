import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  queryWithChain,
  waitForElement,
  waitForElementRemoval,
  findComposerTrigger,
  waitForComposerTrigger,
  SelectorTimeoutError,
  type SelectorChain,
} from '@content/facebook/selectors';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeChain(name: string, strategies: string[]): SelectorChain {
  return { name, strategies };
}

describe('queryWithChain', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns first matching element across strategies', () => {
    document.body.innerHTML = '<button role="button" aria-label="Post">Post</button>';
    const chain = makeChain('post button', [
      '[role="button"][aria-label="Post"]',
      '.fallback-post-btn',
    ]);

    const el = queryWithChain(chain);
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-label')).toBe('Post');
  });

  it('returns null when no strategy matches', () => {
    document.body.innerHTML = '<div>Nothing here</div>';
    const chain = makeChain('ghost', ['#does-not-exist', '.also-missing']);

    expect(queryWithChain(chain)).toBeNull();
  });

  it('prefers primary strategy over fallback when both match', () => {
    document.body.innerHTML = `
      <button role="button" aria-label="Post" id="primary">Primary</button>
      <div class="fallback-btn" id="fallback">Fallback</div>
    `;
    const chain = makeChain('post button', [
      '[role="button"][aria-label="Post"]',
      '.fallback-btn',
    ]);

    const el = queryWithChain(chain);
    expect(el?.id).toBe('primary');
  });

  it('falls back to second strategy when primary misses', () => {
    document.body.innerHTML = '<div class="fallback-btn" id="fb">Fallback</div>';
    const chain = makeChain('button', [
      '[role="button"][aria-label="Post"]',
      '.fallback-btn',
    ]);

    const el = queryWithChain(chain);
    expect(el?.id).toBe('fb');
  });

  it('searches within a custom root element', () => {
    document.body.innerHTML = `
      <div id="outer"><button class="btn">Outer</button></div>
      <div id="inner"><button class="btn">Inner</button></div>
    `;
    const chain = makeChain('btn', ['.btn']);
    const inner = document.getElementById('inner')!;

    const el = queryWithChain(chain, inner);
    expect(el?.textContent).toBe('Inner');
  });
});

describe('findComposerTrigger', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds button containing "Write something..." text', () => {
    document.body.innerHTML = `
      <div role="button" tabindex="0" id="composer-trigger">
        <span>Write something...</span>
      </div>
    `;
    const el = findComposerTrigger();
    expect(el).not.toBeNull();
    expect(el?.id).toBe('composer-trigger');
  });

  it('finds button containing "What\'s on your mind" text', () => {
    document.body.innerHTML = `
      <div role="button" tabindex="0" id="mind-trigger">
        <span>What's on your mind?</span>
      </div>
    `;
    const el = findComposerTrigger();
    expect(el).not.toBeNull();
    expect(el?.id).toBe('mind-trigger');
  });

  it('finds button containing "Create your first post" text', () => {
    document.body.innerHTML = `
      <div role="button" tabindex="0" id="first-post">
        <span>Create your first post...</span>
      </div>
    `;
    const el = findComposerTrigger();
    expect(el).not.toBeNull();
    expect(el?.id).toBe('first-post');
  });

  it('does NOT match menu buttons or comment buttons', () => {
    document.body.innerHTML = `
      <div role="button" tabindex="0" aria-label="Facebook menu">Menu</div>
      <div role="button" tabindex="0" aria-label="Your profile">Profile</div>
      <div role="button" tabindex="0" aria-label="Comment">Comment</div>
    `;
    expect(findComposerTrigger()).toBeNull();
  });

  it('does NOT match non-tabindex buttons', () => {
    document.body.innerHTML = `
      <div role="button">Write something...</div>
    `;
    // Missing tabindex="0"
    expect(findComposerTrigger()).toBeNull();
  });

  it('searches within custom root', () => {
    document.body.innerHTML = `
      <div id="sidebar">
        <div role="button" tabindex="0">Write something...</div>
      </div>
      <div id="main">
        <div role="button" tabindex="0" id="main-trigger">Write something...</div>
      </div>
    `;
    const main = document.getElementById('main')!;
    const el = findComposerTrigger(main);
    expect(el?.id).toBe('main-trigger');
  });
});

describe('waitForElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves immediately when element exists', async () => {
    document.body.innerHTML = '<div id="target" role="textbox" contenteditable="true">Hello</div>';
    const chain = makeChain('editor', ['[role="textbox"][contenteditable="true"]']);

    const el = await waitForElement(chain, 1000);
    expect(el).not.toBeNull();
    expect(el.id).toBe('target');
  });

  it('resolves when element appears via MutationObserver', async () => {
    const chain = makeChain('delayed', ['#delayed-element']);

    // Add element after a delay
    setTimeout(() => {
      const el = document.createElement('div');
      el.id = 'delayed-element';
      document.body.appendChild(el);
    }, 50);

    const el = await waitForElement(chain, 2000);
    expect(el.id).toBe('delayed-element');
  });

  it('rejects with SelectorTimeoutError after timeout', async () => {
    const chain = makeChain('missing', ['#will-never-appear']);

    await expect(waitForElement(chain, 100)).rejects.toThrow(SelectorTimeoutError);

    try {
      await waitForElement(chain, 100);
    } catch (err) {
      expect(err).toBeInstanceOf(SelectorTimeoutError);
      expect((err as SelectorTimeoutError).chain).toBe(chain);
      expect((err as SelectorTimeoutError).timeoutMs).toBe(100);
    }
  });
});

describe('waitForComposerTrigger', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves immediately when trigger exists', async () => {
    document.body.innerHTML = '<div role="button" tabindex="0" id="t">Write something...</div>';
    const el = await waitForComposerTrigger(1000);
    expect(el.id).toBe('t');
  });

  it('resolves when trigger appears later', async () => {
    setTimeout(() => {
      const el = document.createElement('div');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.textContent = 'Write something...';
      el.id = 'delayed-trigger';
      document.body.appendChild(el);
    }, 50);

    const el = await waitForComposerTrigger(2000);
    expect(el.id).toBe('delayed-trigger');
  });

  it('rejects with SelectorTimeoutError after timeout', async () => {
    await expect(waitForComposerTrigger(100)).rejects.toThrow(SelectorTimeoutError);
  });
});

describe('waitForElementRemoval', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves immediately when element is already disconnected', async () => {
    const el = document.createElement('div');
    // Not appended — already disconnected
    await expect(waitForElementRemoval(el, 100)).resolves.toBeUndefined();
  });

  it('resolves when element is removed from DOM', async () => {
    const el = document.createElement('div');
    el.id = 'removable';
    document.body.appendChild(el);

    setTimeout(() => {
      el.remove();
    }, 50);

    await expect(waitForElementRemoval(el, 2000)).resolves.toBeUndefined();
  });

  it('rejects after timeout if element stays', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    await expect(waitForElementRemoval(el, 100)).rejects.toThrow('Timed out');
  });
});
