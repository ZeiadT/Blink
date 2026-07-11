import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@shared/constants';
import { useGroupStore } from '@sidepanel/store/groupStore';

beforeEach(() => {
  vi.mocked(chrome.storage.local.get)
    .mockReset()
    .mockResolvedValue({} as any);
  vi.mocked(chrome.storage.local.set).mockReset().mockResolvedValue(undefined);
  useGroupStore.setState({
    activeGroups: [],
    savedLists: [],
    isLoaded: false,
    isPersisting: false,
    isPreviewingImport: false,
    catalogError: null,
    importPreview: null,
    catalogRevision: 0,
  });
});

describe('group store catalog actions', () => {
  it('should persist canonical manual entries before committing state', async () => {
    const result = await useGroupStore
      .getState()
      .addEntries(['https://m.facebook.com/groups/Example/?ref=share', 'example', 'bad id']);

    expect(result).toMatchObject({
      ok: true,
      added: 1,
      invalid: ['bad id'],
      duplicates: ['example (repeated in this entry)'],
    });
    expect(useGroupStore.getState().activeGroups).toEqual([
      {
        groupId: 'example',
        url: 'https://www.facebook.com/groups/example',
        name: 'example',
      },
    ]);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [STORAGE_KEYS.ACTIVE_GROUPS]: useGroupStore.getState().activeGroups,
        [STORAGE_KEYS.GROUP_LISTS]: [],
      }),
    );
  });

  it('should retain prior state and surface an actionable error when storage fails', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('quota exceeded'));

    const result = await useGroupStore.getState().addEntries(['example']);

    expect(result).toMatchObject({
      ok: false,
      added: 0,
      error: expect.stringContaining('quota exceeded'),
    });
    expect(useGroupStore.getState().activeGroups).toEqual([]);
    expect(useGroupStore.getState().catalogError).toContain('quota exceeded');
  });

  it('should migrate legacy active and saved records once during hydration', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [STORAGE_KEYS.ACTIVE_GROUPS]: [
        { url: 'https://facebook.com/groups/legacy', label: 'Legacy name' },
      ],
      [STORAGE_KEYS.GROUP_LISTS]: [
        {
          id: 'saved-1',
          name: 'Saved',
          groups: [{ url: 'https://facebook.com/groups/saved' }],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as any);

    const result = await useGroupStore.getState().hydrateCatalog();

    expect(result.ok).toBe(true);
    expect(useGroupStore.getState().activeGroups[0]).toMatchObject({
      groupId: 'legacy',
      name: 'Legacy name',
    });
    expect(useGroupStore.getState().savedLists[0].groups[0]).toMatchObject({
      groupId: 'saved',
      name: 'saved',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('should preserve an import preview until one confirmed catalog write succeeds', async () => {
    const previewed = await useGroupStore
      .getState()
      .previewImport(
        new File(['id,name\nimported,Imported group'], 'groups.csv', { type: 'text/csv' }),
      );
    expect(previewed.ok).toBe(true);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    const preview = useGroupStore.getState().importPreview;
    expect(preview).not.toBeNull();
    const confirmed = await useGroupStore.getState().confirmImport(preview!.id);

    expect(confirmed).toMatchObject({ ok: true, added: 1 });
    expect(useGroupStore.getState().importPreview).toBeNull();
    expect(useGroupStore.getState().activeGroups[0]).toMatchObject({
      groupId: 'imported',
      name: 'Imported group',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });
});
