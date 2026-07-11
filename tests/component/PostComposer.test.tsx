import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { PostComposer } from '@sidepanel/components/PostComposer/PostComposer';
import { usePostStore } from '@sidepanel/store/postStore';

// Reset store between tests
beforeEach(() => {
  usePostStore.setState({
    draft: {
      id: 'test-id',
      text: '',
      mediaFiles: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    savedPosts: [],
    isDirty: false,
    isLoaded: true, // Skip loading state for tests
    error: null,
  });
});

describe('PostComposer', () => {
  it('should render the text area', () => {
    render(<PostComposer />);
    expect(screen.getByLabelText('Post text content')).toBeInTheDocument();
  });

  it('should render the media upload area', () => {
    render(<PostComposer />);
    expect(screen.getByLabelText('Upload media files')).toBeInTheDocument();
  });

  it('should update text when typing', async () => {
    render(<PostComposer />);
    const textarea = screen.getByLabelText('Post text content');
    await userEvent.type(textarea, 'Hello world');
    expect(usePostStore.getState().draft.text).toBe('Hello world');
  });

  it('should show character count', async () => {
    usePostStore.setState((s) => ({
      draft: { ...s.draft, text: 'Hello' },
    }));
    render(<PostComposer />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('should disable Clear button when no content', () => {
    render(<PostComposer />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    expect(clearBtn).toBeDisabled();
  });

  it('should enable Clear button when there is content', () => {
    usePostStore.setState((s) => ({
      draft: { ...s.draft, text: 'Something' },
    }));
    render(<PostComposer />);
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    expect(clearBtn).not.toBeDisabled();
  });

  it('should show preview when there is content', () => {
    usePostStore.setState((s) => ({
      draft: { ...s.draft, text: 'Preview this' },
    }));
    render(<PostComposer />);
    expect(screen.getAllByText('Preview this').length).toBeGreaterThanOrEqual(1);
  });

  it('should not show preview when empty', () => {
    render(<PostComposer />);
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('should show disclaimer text', () => {
    usePostStore.setState({ isLoaded: true });
    render(<PostComposer />);
    expect(screen.getByText(/automated posting/i)).toBeInTheDocument();
  });

  it('should create a reusable saved post without changing campaign text', async () => {
    const user = userEvent.setup();
    usePostStore.setState((state) => ({
      draft: { ...state.draft, text: 'Campaign copy\n\nwith paragraphs' },
    }));
    render(<PostComposer />);

    await user.click(screen.getByRole('button', { name: /save as reusable/i }));
    await user.type(screen.getByLabelText('Saved post title'), 'Weekly update');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(usePostStore.getState().savedPosts).toHaveLength(1);
    });
    expect(usePostStore.getState().savedPosts[0]).toMatchObject({
      title: 'Weekly update',
      text: 'Campaign copy\n\nwith paragraphs',
    });
    expect(usePostStore.getState().draft.text).toBe('Campaign copy\n\nwith paragraphs');
  });

  it('should confirm before replacing changed campaign draft with saved post copy', async () => {
    const user = userEvent.setup();
    usePostStore.setState((state) => ({
      draft: { ...state.draft, text: 'Campaign-only edit' },
      savedPosts: [
        {
          id: 'saved-1',
          title: 'Reusable update',
          text: 'Saved\r\ncontent',
          mediaFiles: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }));
    render(<PostComposer />);

    await user.click(screen.getByRole('button', { name: 'Use' }));
    expect(screen.getByText(/replace campaign draft/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace draft' }));

    await waitFor(() => {
      expect(usePostStore.getState().draft.text).toBe('Saved\r\ncontent');
    });
    expect(usePostStore.getState().savedPosts[0].text).toBe('Saved\r\ncontent');
  });

  it('should keep saved post actions reachable in a fixed-height scroll list', async () => {
    const user = userEvent.setup();
    usePostStore.setState({
      savedPosts: Array.from({ length: 4 }, (_, index) => ({
        id: `saved-${index + 1}`,
        title: `Saved post ${index + 1}`,
        text: `Reusable content ${index + 1}`,
        mediaFiles: [],
        createdAt: index + 1,
        updatedAt: index + 1,
      })),
    });
    render(<PostComposer />);

    const list = screen.getByRole('region', { name: 'Saved post list' });
    expect(screen.getAllByRole('button', { name: 'Use' })[0]).toBeEnabled();

    Object.defineProperty(list, 'scrollTop', { value: 250, writable: true });
    fireEvent.scroll(list);
    expect(list.scrollTop).toBe(250);

    const lastEdit = screen.getByRole('button', { name: 'Edit Saved post 4' });
    expect(lastEdit).toBeEnabled();
    await user.click(lastEdit);
    expect(screen.getByText('Edit reusable post')).toBeInTheDocument();
  });
});
