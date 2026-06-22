import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlatformRegistry } from '@content/registry';
import type { PlatformAdapter, PostDraft, PostResult } from '@shared/types';

// ── Mock Adapter ─────────────────────────────────────────────────────────

function createMockAdapter(id: string, urlPattern: RegExp): PlatformAdapter {
  return {
    platformId: id,
    platformName: id.charAt(0).toUpperCase() + id.slice(1),
    isValidGroupUrl: (url: string) => urlPattern.test(url),
    detectGroupPage: () => false,
    executePost: vi.fn().mockResolvedValue({
      groupUrl: 'test',
      status: 'success' as const,
      timestamp: Date.now(),
    }),
  };
}

describe('PlatformRegistry', () => {
  let registry: PlatformRegistry;

  beforeEach(() => {
    registry = new PlatformRegistry();
  });

  it('getAdapterForUrl returns correct adapter for FB group URLs', () => {
    const fbAdapter = createMockAdapter(
      'facebook',
      /^https?:\/\/(www\.|m\.)?facebook\.com\/groups\//,
    );
    registry.register('facebook', () => fbAdapter);

    const result = registry.getAdapterForUrl('https://www.facebook.com/groups/testgroup/');
    expect(result).not.toBeNull();
    expect(result!.platformId).toBe('facebook');
  });

  it('getAdapterForUrl returns null for unknown URLs', () => {
    const fbAdapter = createMockAdapter(
      'facebook',
      /^https?:\/\/(www\.|m\.)?facebook\.com\/groups\//,
    );
    registry.register('facebook', () => fbAdapter);

    expect(registry.getAdapterForUrl('https://twitter.com/some/page')).toBeNull();
    expect(registry.getAdapterForUrl('https://linkedin.com/groups/123')).toBeNull();
    expect(registry.getAdapterForUrl('not-a-url')).toBeNull();
  });

  it('register adds new adapter, retrievable by ID', () => {
    expect(registry.getAdapter('linkedin')).toBeNull();

    const liAdapter = createMockAdapter('linkedin', /linkedin\.com/);
    registry.register('linkedin', () => liAdapter);

    const result = registry.getAdapter('linkedin');
    expect(result).not.toBeNull();
    expect(result!.platformId).toBe('linkedin');
  });

  it('registeredPlatforms lists all platform IDs', () => {
    expect(registry.registeredPlatforms).toEqual([]);

    registry.register('facebook', () => createMockAdapter('facebook', /facebook/));
    registry.register('linkedin', () => createMockAdapter('linkedin', /linkedin/));

    const platforms = registry.registeredPlatforms;
    expect(platforms).toContain('facebook');
    expect(platforms).toContain('linkedin');
    expect(platforms).toHaveLength(2);
  });

  it('multiple adapters can coexist', () => {
    const fbAdapter = createMockAdapter(
      'facebook',
      /^https?:\/\/(www\.|m\.)?facebook\.com\/groups\//,
    );
    const liAdapter = createMockAdapter(
      'linkedin',
      /^https?:\/\/(www\.)?linkedin\.com\/groups\//,
    );

    registry.register('facebook', () => fbAdapter);
    registry.register('linkedin', () => liAdapter);

    const fb = registry.getAdapterForUrl('https://www.facebook.com/groups/test/');
    const li = registry.getAdapterForUrl('https://www.linkedin.com/groups/123/');

    expect(fb?.platformId).toBe('facebook');
    expect(li?.platformId).toBe('linkedin');
  });

  it('getAdapter returns null for unregistered platform', () => {
    expect(registry.getAdapter('reddit')).toBeNull();
  });
});
