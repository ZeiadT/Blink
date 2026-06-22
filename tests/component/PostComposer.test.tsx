import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    isDirty: false,
    isLoaded: true, // Skip loading state for tests
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
});
