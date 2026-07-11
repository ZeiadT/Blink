import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComposerError,
  dispatchComposerEnter,
  normalizeComposerText,
  normalizeComposerVerificationText,
  readComposerText,
  typeText,
  verifyComposerText,
} from '@content/facebook/composer';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('normalizeComposerText', () => {
  it('normalizes only line endings at Facebook insertion seam', () => {
    const text = 'Paragraph one\r\n\r\n- مرحبا\rEmoji 😀\nLast line';

    expect(normalizeComposerText(text)).toBe('Paragraph one\n\n- مرحبا\nEmoji 😀\nLast line');
  });

  it('keeps internal whitespace and unicode unchanged', () => {
    const text = '  keep  spaces\n\nالعربية 😀  ';
    expect(normalizeComposerText(text)).toBe(text);
  });

  it('normalizes non-breaking spaces only for DOM verification', () => {
    expect(normalizeComposerVerificationText('Keep\u00a0spaces')).toBe('Keep spaces');
  });
});

describe('readComposerText', () => {
  it('preserves paragraph and blank-line boundaries', () => {
    document.body.innerHTML = [
      '<div id="editor" contenteditable="true">',
      '<p>First line</p>',
      '<p><br></p>',
      '<p>Third line</p>',
      '</div>',
    ].join('');

    const editor = document.getElementById('editor') as HTMLElement;
    expect(readComposerText(editor)).toBe('First line\n\nThird line');
  });

  it('preserves inline line breaks and ignores markup wrappers', () => {
    document.body.innerHTML = [
      '<div id="editor" contenteditable="true">',
      '<p><span>Hello</span><br><a href="#">World</a></p>',
      '</div>',
    ].join('');

    const editor = document.getElementById('editor') as HTMLElement;
    expect(readComposerText(editor)).toBe('Hello\nWorld');
  });
});

describe('dispatchComposerEnter', () => {
  it('dispatches bubbling Enter keydown event to Lexical editor', () => {
    const editor = document.createElement('div');
    document.body.append(editor);
    const listener = vi.fn((event: KeyboardEvent) => event.preventDefault());
    editor.addEventListener('keydown', listener);

    dispatchComposerEnter(editor);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event).toMatchObject({
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });
  });
});

describe('composer verification', () => {
  it('rejects concatenated text before post submission', async () => {
    const editor = document.createElement('div');
    editor.textContent = 'HelloWorld';

    await expect(verifyComposerText(editor, 'Hello\nWorld', 0)).rejects.toBeInstanceOf(ComposerError);
  });

  it('types multiline text through Enter events, never insertParagraph', async () => {
    const editor = document.createElement('div');
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('contenteditable', 'true');
    editor.dataset.lexicalEditor = 'true';
    document.body.append(editor);

    let currentParagraph = document.createElement('p');
    editor.append(currentParagraph);
    editor.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      currentParagraph = document.createElement('p');
      editor.append(currentParagraph);
    });

    const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const execCommand = vi.fn((command: string, _showUi?: boolean, value?: string) => {
      if (command !== 'insertText') return false;
      currentParagraph.append(value ?? '');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    try {
      await typeText('Hello\nWorld');

      expect(readComposerText(editor)).toBe('Hello\nWorld');
      expect(execCommand).not.toHaveBeenCalledWith('insertParagraph', false);
      expect(execCommand).toHaveBeenCalledTimes('HelloWorld'.length);
    } finally {
      if (originalExecCommand) {
        Object.defineProperty(document, 'execCommand', originalExecCommand);
      } else {
        delete (document as Document & { execCommand?: Document['execCommand'] }).execCommand;
      }
    }
  });
});
