import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isGroupPage, getGroupInfo, isComposerAvailable } from '@content/facebook/detector';

// ── Helpers ──────────────────────────────────────────────────────────────

function setUrl(url: string): void {
  Object.defineProperty(window, 'location', {
    value: { href: url },
    writable: true,
    configurable: true,
  });
}

function buildGroupPageDom(opts: {
  hasComposer?: boolean;
  hasHeading?: boolean;
  headingText?: string;
  hasMainContent?: boolean;
} = {}): void {
  const {
    hasComposer = true,
    hasHeading = true,
    headingText = 'Test Group',
    hasMainContent = true,
  } = opts;

  let html = '';
  if (hasMainContent) {
    html += '<div role="main">';
    if (hasHeading) {
      html += `<h1>${headingText}</h1>`;
    }
    html += '</div>';
  }
  if (hasComposer) {
    // Matches the real Facebook DOM: role="button" with text content
    html += '<div role="button" tabindex="0"><span>Write something...</span></div>';
  }
  document.body.innerHTML = html;
}

describe('isGroupPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true for valid group page URL + DOM structure', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    buildGroupPageDom();
    expect(isGroupPage()).toBe(true);
  });

  it('returns true with heading but no composer', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    buildGroupPageDom({ hasComposer: false });
    expect(isGroupPage()).toBe(true);
  });

  it('returns true with composer but no heading', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    buildGroupPageDom({ hasHeading: false });
    expect(isGroupPage()).toBe(true);
  });

  it('returns false for non-group FB pages (profile)', () => {
    setUrl('https://www.facebook.com/profile.php?id=123');
    buildGroupPageDom();
    expect(isGroupPage()).toBe(false);
  });

  it('returns false for Facebook feed', () => {
    setUrl('https://www.facebook.com/');
    buildGroupPageDom();
    expect(isGroupPage()).toBe(false);
  });

  it('returns false for Facebook marketplace', () => {
    setUrl('https://www.facebook.com/marketplace/');
    buildGroupPageDom();
    expect(isGroupPage()).toBe(false);
  });

  it('returns false when URL matches but no DOM markers', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    document.body.innerHTML = '<div>Loading...</div>';
    expect(isGroupPage()).toBe(false);
  });

  it('handles mobile Facebook URLs', () => {
    setUrl('https://m.facebook.com/groups/testgroup123/');
    buildGroupPageDom();
    expect(isGroupPage()).toBe(true);
  });
});

describe('getGroupInfo', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts name from heading element', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    buildGroupPageDom({ headingText: 'My Cool Group' });

    const info = getGroupInfo();
    expect(info).not.toBeNull();
    expect(info!.name).toBe('My Cool Group');
    expect(info!.url).toBe('https://www.facebook.com/groups/testgroup123/');
  });

  it('returns "Unknown Group" when heading is absent', () => {
    setUrl('https://www.facebook.com/groups/testgroup123/');
    buildGroupPageDom({ hasHeading: false });

    const info = getGroupInfo();
    expect(info).not.toBeNull();
    expect(info!.name).toBe('Unknown Group');
  });

  it('returns null on non-group pages', () => {
    setUrl('https://www.facebook.com/marketplace/');
    buildGroupPageDom();

    expect(getGroupInfo()).toBeNull();
  });
});

describe('isComposerAvailable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns true when composer trigger element exists', () => {
    buildGroupPageDom({ hasComposer: true });
    expect(isComposerAvailable()).toBe(true);
  });

  it('returns false when trigger absent (view-only group)', () => {
    buildGroupPageDom({ hasComposer: false });
    expect(isComposerAvailable()).toBe(false);
  });
});
