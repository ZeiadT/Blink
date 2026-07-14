import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignSetup } from '@sidepanel/components/CampaignDashboard/CampaignSetup';
import { useCampaignSetupStore } from '@sidepanel/store/campaignSetupStore';
import { useGroupStore } from '@sidepanel/store/groupStore';
import { usePostStore } from '@sidepanel/store/postStore';
import { useSettingsStore } from '@sidepanel/store/settingsStore';
import { DEFAULT_CAMPAIGN_SETTINGS } from '@shared/constants';

const currentGroup = {
  groupId: 'current-group',
  url: 'https://facebook.com/groups/current-group',
  name: 'Current group',
};

const collectionGroup = {
  groupId: 'collection-group',
  url: 'https://facebook.com/groups/collection-group',
  name: 'Collection group',
};

beforeEach(() => {
  vi.clearAllMocks();
  useCampaignSetupStore.getState().reset();
  usePostStore.setState({
    draft: {
      id: 'draft',
      text: 'Current draft',
      mediaFiles: [],
      createdAt: 1,
      updatedAt: 1,
    },
    savedPosts: [
      {
        id: 'template-1',
        title: 'Launch update',
        text: 'Template content',
        mediaFiles: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    isLoaded: true,
    isDirty: false,
    error: null,
  });
  useGroupStore.setState({
    activeGroups: [currentGroup],
    savedLists: [
      {
        id: 'collection-1',
        name: 'Launch groups',
        groups: [collectionGroup],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    isLoaded: true,
    isPersisting: false,
    isPreviewingImport: false,
    catalogError: null,
    importPreview: null,
    catalogRevision: 0,
  });
  useSettingsStore.setState({
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS },
    isLoaded: true,
    isPersisting: false,
    error: null,
  });
});

describe('CampaignSetup', () => {
  it('starts from saved sources without mutating current draft or groups', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<CampaignSetup loading={false} onStart={onStart} />);

    await user.selectOptions(screen.getByLabelText('Post template'), 'template-1');
    await user.selectOptions(screen.getByLabelText('Group collection'), 'collection-1');
    await user.click(screen.getByRole('checkbox', { name: /randomize group order/i }));
    await user.click(screen.getByRole('button', { name: /start posting/i }));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Template content' }),
      [collectionGroup],
      {
        postSource: { kind: 'saved', id: 'template-1', label: 'Launch update' },
        groupSource: { kind: 'saved', id: 'collection-1', label: 'Launch groups' },
        randomizeGroupOrder: true,
      },
    );
    expect(usePostStore.getState().draft.text).toBe('Current draft');
    expect(useGroupStore.getState().activeGroups).toEqual([currentGroup]);
  });

  it('blocks launch and gives recovery guidance for empty current sources', () => {
    usePostStore.setState((state) => ({
      draft: { ...state.draft, text: '', mediaFiles: [] },
    }));
    useGroupStore.setState({ activeGroups: [] });

    render(<CampaignSetup loading={false} onStart={vi.fn()} />);

    expect(screen.getByText(/add content in Compose/i)).toBeInTheDocument();
    expect(screen.getByText(/add groups or create a collection/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start posting/i })).toBeDisabled();
  });

  it('surfaces a deleted selected source and allows recovery', () => {
    useCampaignSetupStore.setState({
      postSourceId: 'deleted-template',
      groupSourceId: 'deleted-collection',
    });

    render(<CampaignSetup loading={false} onStart={vi.fn()} />);

    expect(screen.getByText(/selected post template was deleted/i)).toBeInTheDocument();
    expect(screen.getByText(/selected group collection was deleted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start posting/i })).toBeDisabled();
  });
});
