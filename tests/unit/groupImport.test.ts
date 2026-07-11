import { describe, expect, it } from 'vitest';
import { previewGroupImport } from '@shared/groupImport';
import type { CatalogGroupEntry } from '@shared/types';

const existing: CatalogGroupEntry[] = [
  {
    groupId: 'existing-group',
    url: 'https://www.facebook.com/groups/existing-group',
    name: 'Existing group',
  },
];

function importFile(name: string, text: string): File {
  return new File([text], name, { type: name.endsWith('.csv') ? 'text/csv' : 'text/plain' });
}

describe('group import preview', () => {
  it('should parse BOM CSV headers, quoted names, Arabic, and emoji without writing', async () => {
    const result = await previewGroupImport(
      importFile(
        'groups.csv',
        '\uFEFFgroupUrl,displayName\nhttps://m.facebook.com/groups/First/?ref=share,"Arabic مجموعة, ✨"\nsecond,Second',
      ),
      existing,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ validCount: 2, duplicateCount: 0, invalidCount: 0 });
    expect(result.preview.rows[0].candidate).toEqual({
      groupId: 'first',
      url: 'https://www.facebook.com/groups/first',
      name: 'Arabic مجموعة, ✨',
    });
  });

  it('should detect semicolon headers plus existing and in-file duplicates with reasons', async () => {
    const result = await previewGroupImport(
      importFile('groups.csv', 'id;name\nexisting-group;Again\nnew-group;New\nNEW-GROUP;Repeat'),
      existing,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ validCount: 1, duplicateCount: 2, invalidCount: 0 });
    expect(result.preview.rows.map((row) => row.reasonCode)).toEqual([
      'duplicate_existing',
      undefined,
      'duplicate_in_file',
    ]);
  });

  it('should accept headerless one-column TXT and flag malformed rows', async () => {
    const result = await previewGroupImport(
      importFile('groups.txt', 'one\nhttps://facebook.com/groups/two\nnot a valid id'),
      [],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview).toMatchObject({ validCount: 2, invalidCount: 1 });
    expect(result.preview.rows[2]).toMatchObject({
      status: 'invalid',
      reasonCode: 'unsupported_group_id',
    });
  });

  it('should parse tab-separated CRLF headers and headerless two-column rows', async () => {
    const tabbed = await previewGroupImport(
      importFile(
        'groups.txt',
        'GROUP ID\tGroup Name\r\nfirst\tFirst group\r\nsecond\tSecond group',
      ),
      [],
    );
    expect(tabbed).toMatchObject({ ok: true });
    if (tabbed.ok) {
      expect(tabbed.preview).toMatchObject({ separator: 'tab', validCount: 2 });
      expect(tabbed.preview.rows[1].candidate?.name).toBe('Second group');
    }

    const headerless = await previewGroupImport(importFile('groups.csv', 'third,Third group'), []);
    expect(headerless).toMatchObject({ ok: true });
    if (headerless.ok) expect(headerless.preview.rows[0].candidate?.name).toBe('Third group');
  });

  it('should reject unsupported file types and imports larger than row limit', async () => {
    const unsupported = await previewGroupImport(importFile('groups.json', '[]'), []);
    expect(unsupported).toMatchObject({ ok: false, error: { code: 'unsupported_file' } });

    const rows = Array.from({ length: 2001 }, (_, index) => `group-${index}`).join('\n');
    const tooManyRows = await previewGroupImport(importFile('groups.txt', rows), []);
    expect(tooManyRows).toMatchObject({ ok: false, error: { code: 'too_many_rows' } });
  });
});
