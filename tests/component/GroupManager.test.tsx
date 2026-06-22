import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { GroupManager } from '@sidepanel/components/GroupManager/GroupManager';
import { useGroupStore } from '@sidepanel/store/groupStore';

beforeEach(() => {
  useGroupStore.setState({
    activeGroups: [],
    savedLists: [],
    isLoaded: true,
  });
});

describe('GroupManager', () => {
  it('should render URL input area', () => {
    render(<GroupManager />);
    expect(screen.getByLabelText('Group URLs input')).toBeInTheDocument();
  });

  it('should show empty state when no groups', () => {
    render(<GroupManager />);
    expect(screen.getByText('No groups added yet')).toBeInTheDocument();
  });

  it('should show group count after adding URLs', () => {
    useGroupStore.setState({
      activeGroups: [
        { url: 'https://facebook.com/groups/test1' },
        { url: 'https://facebook.com/groups/test2' },
      ],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByText('2 groups')).toBeInTheDocument();
  });

  it('should show saved lists section', () => {
    render(<GroupManager />);
    expect(screen.getByText('No saved lists yet.')).toBeInTheDocument();
  });

  it('should show save button when groups exist', () => {
    useGroupStore.setState({
      activeGroups: [{ url: 'https://facebook.com/groups/test1' }],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByRole('button', { name: /save current/i })).not.toBeDisabled();
  });

  it('should disable save button when no groups', () => {
    render(<GroupManager />);
    expect(screen.getByRole('button', { name: /save current/i })).toBeDisabled();
  });

  it('should show saved list name in list', () => {
    useGroupStore.setState({
      activeGroups: [{ url: 'https://facebook.com/groups/test1' }],
      savedLists: [
        {
          id: '1',
          name: 'My List',
          groups: [{ url: 'https://facebook.com/groups/test1' }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      isLoaded: true,
    });
    render(<GroupManager />);
    expect(screen.getByText('My List')).toBeInTheDocument();
  });
});
