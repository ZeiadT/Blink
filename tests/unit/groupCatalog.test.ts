import { describe, expect, it } from 'vitest';
import {
  canonicalGroupUrl,
  migrateCatalog,
  normalizeDisplayName,
  normalizeGroupIdentity,
} from '@shared/groupCatalog';

describe('group catalog identity', () => {
  it('should normalize supported URL variants and raw IDs to one canonical identity', () => {
    const variants = [
      'https://www.facebook.com/groups/Example.Group/?ref=share#fragment',
      'http://m.facebook.com/groups/example.group/',
      'example.group',
      '123456789',
    ];

    expect(normalizeGroupIdentity(variants[0])).toEqual({
      ok: true,
      value: { groupId: 'example.group', url: canonicalGroupUrl('example.group') },
    });
    expect(normalizeGroupIdentity(variants[1])).toEqual({
      ok: true,
      value: { groupId: 'example.group', url: canonicalGroupUrl('example.group') },
    });
    expect(normalizeGroupIdentity(variants[2])).toEqual({
      ok: true,
      value: { groupId: 'example.group', url: canonicalGroupUrl('example.group') },
    });
    expect(normalizeGroupIdentity(variants[3])).toEqual({
      ok: true,
      value: { groupId: '123456789', url: canonicalGroupUrl('123456789') },
    });
  });

  it('should reject malformed, unsupported, and extra-path identities', () => {
    expect(normalizeGroupIdentity('')).toMatchObject({
      ok: false,
      error: { code: 'empty_identity' },
    });
    expect(normalizeGroupIdentity('https://twitter.com/groups/test')).toMatchObject({
      ok: false,
      error: { code: 'unsupported_url' },
    });
    expect(normalizeGroupIdentity('https://facebook.com/groups/test/extra')).toMatchObject({
      ok: false,
      error: { code: 'unsupported_url' },
    });
    expect(normalizeGroupIdentity('group id')).toMatchObject({
      ok: false,
      error: { code: 'unsupported_group_id' },
    });
  });

  it('should normalize display names and fall back to the group ID', () => {
    expect(normalizeDisplayName('  My   Group  ', 'group-id')).toBe('My Group');
    expect(normalizeDisplayName(' \n ', 'group-id')).toBe('group-id');
  });
});

describe('catalog migration', () => {
  it('should migrate legacy label data, merge normalized collisions, and preserve earliest metadata', () => {
    const migrated = migrateCatalog(
      [
        {
          url: 'https://facebook.com/groups/Example',
          lastPostStatus: 'success',
          lastPostAt: 10,
        },
        { url: 'https://m.facebook.com/groups/example/?ref=share', label: 'Named group' },
      ],
      [],
    );

    expect(migrated).toMatchObject({ ok: true, changed: true });
    expect(migrated.activeGroups).toEqual([
      {
        groupId: 'example',
        url: 'https://www.facebook.com/groups/example',
        name: 'Named group',
        lastPostStatus: 'success',
        lastPostAt: 10,
      },
    ]);
  });

  it('should leave modern catalog records unchanged on repeat reads', () => {
    const modern = {
      groupId: 'example',
      url: 'https://www.facebook.com/groups/example',
      name: 'Example group',
    };
    const migrated = migrateCatalog([modern], []);

    expect(migrated).toMatchObject({ ok: true, changed: false, activeGroups: [modern] });
  });

  it('should fail closed when legacy records cannot be validated', () => {
    const migrated = migrateCatalog([{ url: 'https://twitter.com/groups/example' }], []);

    expect(migrated.ok).toBe(false);
    expect(migrated.errors[0]).toMatchObject({ code: 'unsupported_url' });
  });
});
