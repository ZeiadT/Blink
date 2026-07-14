import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { GroupManager } from '@sidepanel/components/GroupManager/GroupManager';
import { useGroupStore } from '@sidepanel/store/groupStore';

const group = (groupId: string) => ({
  groupId,
  url: `https://www.facebook.com/groups/${groupId}`,
  name: groupId,
});

beforeEach(() => {
  useGroupStore.setState({
    activeGroups: [],
    savedLists: [],
    isLoaded: true,
    isPersisting: false,
    isPreviewingImport: false,
    catalogError: null,
    importPreview: null,
    catalogRevision: 0,
  });
});

describe('GroupManager', () => {
  it('should render URL input area', () => {
    render(<GroupManager />);
    expect(screen.getByLabelText('Group URLs input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import groups/i })).toBeInTheDocument();
  });

  it('should show empty state when no groups', () => {
    render(<GroupManager />);
    expect(screen.getByText('No groups added yet')).toBeInTheDocument();
  });

  it('should show group count after adding URLs', () => {
    useGroupStore.setState({
      activeGroups: [group('test1'), group('test2')],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByText('2 groups')).toBeInTheDocument();
  });

  it('should show group collections section', () => {
    render(<GroupManager />);
    expect(screen.getByText(/no group collections yet/i)).toBeInTheDocument();
  });

  it('should show save button when groups exist', () => {
    useGroupStore.setState({
      activeGroups: [group('test1')],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByRole('button', { name: /save current/i })).not.toBeDisabled();
  });

  it('should disable save button when no groups', () => {
    render(<GroupManager />);
    expect(screen.getByRole('button', { name: /save current/i })).toBeDisabled();
  });

  it('should show collection name in list', () => {
    useGroupStore.setState({
      activeGroups: [group('test1')],
      savedLists: [
        {
          id: '1',
          name: 'My List',
          groups: [group('test1')],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByText('My List')).toBeInTheDocument();
  });

  it('should confirm before deleting a collection', async () => {
    const user = userEvent.setup();
    useGroupStore.setState({
      activeGroups: [group('test1')],
      savedLists: [
        {
          id: '1',
          name: 'My Collection',
          groups: [group('test1')],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      isLoaded: true,
    });
    render(<GroupManager />);

    await user.click(screen.getByRole('button', { name: 'Delete My Collection' }));
    expect(screen.getByText('Delete group collection?')).toBeInTheDocument();
    expect(useGroupStore.getState().savedLists).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Delete collection' }));
    await waitFor(() => expect(useGroupStore.getState().savedLists).toHaveLength(0));
  });
});
